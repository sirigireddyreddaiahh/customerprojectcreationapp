import { unzipSync, zipSync } from 'fflate'

type ResultRow = { sourceRow: number; status?: string; reason?: string }

const decoder = new TextDecoder()
const encoder = new TextEncoder()

function columnName(column: number) {
  let value = column + 1
  let name = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    value = Math.floor((value - 1) / 26)
  }
  return name
}

function escapeXml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

function getStyle(xml: string, address: string) {
  const cell = xml.match(new RegExp(`<c\\b(?=[^>]*\\br="${address}")[^>]*>`))?.[0]
  return cell?.match(/\bs="([^"]+)"/)?.[1]
}

function setInlineString(xml: string, address: string, value: string, style?: string) {
  const match = address.match(/^([A-Z]+)(\d+)$/)!
  const rowNumber = Number(match[2])
  const cell = `<c r="${address}"${style ? ` s="${style}"` : ''} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
  const rowPattern = new RegExp(`<row\\b(?=[^>]*\\br="${rowNumber}")[^>]*>[\\s\\S]*?<\\/row>`)
  const rowMatch = xml.match(rowPattern)
  if (rowMatch) {
    const row = rowMatch[0]
    const cellPattern = new RegExp(`<c\\b(?=[^>]*\\br="${address}")[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)`)
    const replacement = row.replace(cellPattern, cell)
    const nextRow = replacement === row ? row.replace('</row>', `${cell}</row>`) : replacement
    return xml.replace(row, nextRow)
  }

  const newRow = `<row r="${rowNumber}">${cell}</row>`
  const sheetDataEnd = xml.indexOf('</sheetData>')
  if (sheetDataEnd < 0) throw new Error('The Upload Data worksheet XML is missing sheetData.')
  const before = xml.slice(0, sheetDataEnd)
  const laterRow = new RegExp(`<row\\b(?=[^>]*\\br="(\\d+)")[^>]*>`).exec(xml.slice(sheetDataEnd))
  if (laterRow) {
    const insertion = sheetDataEnd + laterRow.index
    return `${xml.slice(0, insertion)}${newRow}${xml.slice(insertion)}`
  }
  return `${before}${newRow}${xml.slice(sheetDataEnd)}`
}

function addResultColumnWidths(xml: string, statusColumn: number, reasonColumn: number, statusWidth: number, reasonWidth: number) {
  const additions = `<col min="${statusColumn}" max="${statusColumn}" width="${statusWidth}" customWidth="1"/><col min="${reasonColumn}" max="${reasonColumn}" width="${reasonWidth}" customWidth="1"/>`
  const cols = xml.match(/<cols\b[^>]*>[\s\S]*?<\/cols>/)
  if (!cols) return xml.replace('<sheetData', `<cols>${additions}</cols><sheetData`)
  let colXml = cols[0]
  for (const [column, width] of [[statusColumn, statusWidth], [reasonColumn, reasonWidth]] as const) {
    const exists = [...colXml.matchAll(/<col\b([^>]*)\/?\s*>/g)].some(match => {
      const min = Number(match[1].match(/\bmin="(\d+)"/)?.[1])
      const max = Number(match[1].match(/\bmax="(\d+)"/)?.[1] || min)
      return min <= column && max >= column
    })
    if (!exists) colXml = colXml.replace('</cols>', `<col min="${column}" max="${column}" width="${width}" customWidth="1"/></cols>`)
  }
  return xml.replace(cols[0], colXml)
}

function worksheetPath(files: Record<string, Uint8Array>, worksheetName: string) {
  const workbook = files['xl/workbook.xml']
  const relationships = files['xl/_rels/workbook.xml.rels']
  if (!workbook || !relationships) throw new Error('The uploaded workbook is missing its workbook metadata.')
  const workbookXml = decoder.decode(workbook)
  const workbookRels = decoder.decode(relationships)
  const sheetTag = workbookXml.match(new RegExp(`<sheet\\b(?=[^>]*\\bname="${escapeXml(worksheetName)}")[^>]*>`))?.[0]
  const relationshipId = sheetTag?.match(/\br:id="([^"]+)"/)?.[1]
  if (!relationshipId) throw new Error(`The uploaded workbook is missing the ${worksheetName} sheet.`)
  const relationTag = workbookRels.match(new RegExp(`<Relationship\\b(?=[^>]*\\bId="${relationshipId}")[^>]*>`))?.[0]
  const target = relationTag?.match(/\bTarget="([^"]+)"/)?.[1]?.replaceAll('&amp;', '&')
  if (!target) throw new Error('Unable to locate the Upload Data worksheet in the workbook.')
  const parts: string[] = []
  for (const part of (target.startsWith('/') ? target.slice(1) : `xl/${target}`).split('/')) {
    if (part === '..') parts.pop()
    else if (part !== '.') parts.push(part)
  }
  const path = parts.join('/')
  if (!files[path]) throw new Error(`The ${worksheetName} worksheet file is missing from the workbook.`)
  return path
}

/** Adds result cells directly to an uploaded XLSX ZIP, leaving all other XML/assets untouched. */
export function createResultWorkbook(source: ArrayBuffer, rows: ResultRow[], options: { worksheetName: string; statusColumn: number; reasonColumn: number; styleColumn: number; statusWidth?: number; reasonWidth?: number }) {
  const files = unzipSync(new Uint8Array(source))
  const path = worksheetPath(files, options.worksheetName)
  let worksheet = decoder.decode(files[path])

  const statusColumnName = columnName(options.statusColumn - 1)
  const reasonColumnName = columnName(options.reasonColumn - 1)
  const styleColumnName = columnName(options.styleColumn - 1)
  const headerStyle = getStyle(worksheet, `${styleColumnName}1`)
  worksheet = setInlineString(worksheet, `${statusColumnName}1`, 'Status', headerStyle)
  worksheet = setInlineString(worksheet, `${reasonColumnName}1`, 'Reason', headerStyle)
  for (const row of rows) {
    const rowNumber = row.sourceRow
    const style = getStyle(worksheet, `${styleColumnName}${rowNumber}`)
    worksheet = setInlineString(worksheet, `${statusColumnName}${rowNumber}`, row.status || '', style)
    worksheet = setInlineString(worksheet, `${reasonColumnName}${rowNumber}`, row.reason || '', style)
  }
  worksheet = addResultColumnWidths(worksheet, options.statusColumn, options.reasonColumn, options.statusWidth || 14, options.reasonWidth || 48)
  worksheet = extendDimension(worksheet, Math.max(1, ...rows.map(row => row.sourceRow)), options.reasonColumn)
  files[path] = encoder.encode(worksheet)
  return zipSync(files, { level: 6 })
}

function extendDimension(xml: string, lastRow: number, lastColumn = 10) {
  return xml.replace(/(<dimension\b[^>]*\bref=")([A-Z]+\d+:)?([A-Z]+)(\d+)("[^>]*\/?\s*>)/, (_match, prefix: string, start: string | undefined, endColumn: string, endRow: string, suffix: string) => {
    const existingColumn = [...endColumn].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0)
    const column = existingColumn >= lastColumn ? endColumn : columnName(lastColumn)
    return `${prefix}${start || 'A1:'}${column}${Math.max(Number(endRow), lastRow)}${suffix}`
  })
}

export const createWorkPackageResultWorkbook = (source: ArrayBuffer, rows: ResultRow[]) => createResultWorkbook(source, rows, { worksheetName: 'Upload Data', statusColumn: 9, reasonColumn: 10, styleColumn: 8 })
