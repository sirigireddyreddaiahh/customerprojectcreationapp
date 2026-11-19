import type { ReactNode } from 'react'

export function DataTable({ headers, children, columnWidths, headerClassNames }: { headers: string[]; children: ReactNode; columnWidths?: Array<number | string>; headerClassNames?: string[] }) {
  return <div className="table-wrap"><table className="data-table"><>{columnWidths && <colgroup>{columnWidths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>}</><thead><tr>{headers.map((header, index) => <th key={`${header}-${index}`} className={headerClassNames?.[index]}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>
}
