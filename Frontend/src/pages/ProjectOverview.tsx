import { useEffect, useMemo, useRef, useState } from "react";
import { DataTable } from "../components/tables/DataTable";
import { SettingsIcon } from "../components/SettingsIcon";
import {
  projectService,
  type ProjectListItem,
} from "../services/projectService";
import "./ProjectWorkspace.css";

const columns: Array<{ key: keyof ProjectListItem; label: string }> = [
  { key: "id", label: "Project ID" },
  { key: "name", label: "Project Name" },
  { key: "manager", label: "Project Manager" },
  { key: "customer", label: "Customer" },
  { key: "salesOrder", label: "Sales Order" },
  { key: "serviceOrganization", label: "Service Organization" },
  { key: "stage", label: "Project Stage" },
  { key: "startDate", label: "Start Date" },
  { key: "endDate", label: "End Date" },
  { key: "billability", label: "Billability" },
  { key: "changedOn", label: "Changed On" },
  { key: "contractingCompanyCode", label: "Contracting Company Code" },
  { key: "costCenter", label: "Cost Center" },
  { key: "currentStage", label: "Current Stage" },
  { key: "customerGroupName", label: "Customer Group Name" },
  { key: "profitCenter", label: "SBU Name" },
  { key: "currency", label: "Project Currency" },
  { key: "projectNature", label: "Project Nature" },
  { key: "projectType", label: "Project Type" },
  { key: "solutionOrderItem", label: "Solution Order (Item)" },
];

type FilterOption = { value: string; label: string };

function ValueHelpFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLLabelElement>(null);
  const matches = options.filter((option) =>
    option.label.toLowerCase().includes(value.toLowerCase()),
  );
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <label className="project-filter-field" ref={rootRef}>
      <span>{label}</span>
      <div className="project-filter-control">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setOpen(false)}
        />
        <button
          type="button"
          className="value-help-button"
          aria-label={`Choose ${label}`}
          title={`Choose ${label}`}
          onClick={() => setOpen((current) => !current)}
        />
        {open && (
          <div className="value-help-menu" role="listbox">
            {matches.length ? (
              matches.map((option) => (
                <button
                  key={`${option.value}-${option.label}`}
                  type="button"
                  role="option"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                </button>
              ))
            ) : (
              <span>No matching values</span>
            )}
          </div>
        )}
      </div>
    </label>
  );
}

export function ProjectOverview({ onOpenWorkspace }: {
  onCreate: () => void;
  onCreateInternal: () => void;
  onOpenWorkspace: (projectId: string) => void;
}) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"columns" | "sort">("columns");
  const [columnSearch, setColumnSearch] = useState("");
  const [visible, setVisible] = useState<(keyof ProjectListItem)[]>(() =>
    columns.map((column) => column.key),
  );
  const [columnOrder, setColumnOrder] = useState<(keyof ProjectListItem)[]>(
    () => columns.map((column) => column.key),
  );
  const [draggedColumn, setDraggedColumn] = useState<
    keyof ProjectListItem | null
  >(null);
  const settingsSnapshot = useRef<{
    visible: (keyof ProjectListItem)[];
    order: (keyof ProjectListItem)[];
  } | null>(null);
  const [filter, setFilter] = useState("");
  const [filters, setFilters] = useState({
    manager: "",
    customer: "",
    serviceOrganization: "",
    stage: "",
  });
  const fetchProjects = () =>
    projectService
      .getRecentProjects()
      .then((result) => setProjects(result.projects))
      .catch(() => setProjects([]))
      .finally(() => setProjectsLoading(false));
  useEffect(() => {
    fetchProjects();
  }, []);
  const loadProject = (id: string) => {
    if (id.trim()) onOpenWorkspace(id.trim());
  };
  const orderedColumns = columnOrder
    .map((key) => columns.find((column) => column.key === key)!)
    .filter(Boolean);
  const shown = orderedColumns.filter((column) => visible.includes(column.key));
  const filtered = useMemo(
    () =>
      projects.filter(
        (item) =>
          Object.values(item).some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(filter.toLowerCase()),
          ) &&
          (!filters.manager ||
            item.manager
              .toLowerCase()
              .includes(filters.manager.toLowerCase())) &&
          (!filters.customer ||
            item.customer
              .toLowerCase()
              .includes(filters.customer.toLowerCase())) &&
          (!filters.serviceOrganization ||
            item.serviceOrganization
              .toLowerCase()
              .includes(filters.serviceOrganization.toLowerCase())) &&
          (!filters.stage ||
            item.stage.toLowerCase().includes(filters.stage.toLowerCase())),
      ),
    [projects, filter, filters],
  );
  const optionsFor = (key: keyof ProjectListItem) =>
    Array.from(
      new Set(projects.map((item) => String(item[key] || "")).filter(Boolean)),
    ).map((value) => ({ value, label: value }));
  const projectOptions = projects.map((item) => ({
    value: item.id,
    label: `${item.id} — ${item.name}`,
  }));
  const stageOrder = [
    "In Planning",
    "Contract Preparation",
    "In Execution",
    "P004",
  ];
  const stageOptions = [
    ...stageOrder,
    ...optionsFor("stage")
      .map((option) => option.value)
      .filter((value) => !stageOrder.includes(value)),
  ].map((value) => ({ value, label: value }));
  const download = () => {
    const rows = [
      [...shown.map((c) => c.label)],
      ...filtered.map((item) =>
        shown.map(
          (c) => `"${String(item[c.key] || "").replaceAll('"', '""')}"`,
        ),
      ),
    ];
    const url = URL.createObjectURL(
      new Blob([rows.map((row) => row.join(",")).join("\n")], {
        type: "text/csv;charset=utf-8;",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "sap-projects.csv";
    link.click();
    URL.revokeObjectURL(url);
  };
  const toggle = (key: keyof ProjectListItem) =>
    setVisible((current) =>
      current.includes(key)
        ? current.filter((value) => value !== key)
        : [...current, key],
    );
  const moveColumn = (from: keyof ProjectListItem, to: keyof ProjectListItem) =>
    setColumnOrder((current) => {
      const next = [...current];
      const fromIndex = next.indexOf(from);
      const toIndex = next.indexOf(to);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return current;
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, from);
      return next;
    });
  const openSettings = () => {
    settingsSnapshot.current = {
      visible: [...visible],
      order: [...columnOrder],
    };
    setColumnSearch("");
    setSettingsTab("columns");
    setSettingsOpen(true);
  };
  const cancelSettings = () => {
    if (settingsSnapshot.current) {
      setVisible(settingsSnapshot.current.visible);
      setColumnOrder(settingsSnapshot.current.order);
    }
    setSettingsOpen(false);
  };
  const resetSettings = () => {
    setVisible(columns.map((column) => column.key));
    setColumnOrder(columns.map((column) => column.key));
    setColumnSearch("");
  };
  const searchedColumns = orderedColumns.filter((column) =>
    column.label.toLowerCase().includes(columnSearch.trim().toLowerCase()),
  );
  return (
    <>
      <section className="card project-view-sections recent-projects-card">
        <div className="project-access-filters">
          <ValueHelpFilter
            label="Project"
            value={filter}
            options={projectOptions}
            onChange={setFilter}
          />
          {(
            [
              { key: "manager", label: "Project Manager", source: "manager" },
              { key: "customer", label: "Customer", source: "customer" },
              {
                key: "serviceOrganization",
                label: "Service Organization",
                source: "serviceOrganization",
              },
              { key: "stage", label: "Current Stage", source: "stage" },
            ] as const
          ).map((field) => (
            <ValueHelpFilter
              key={field.key}
              label={field.label}
              value={filters[field.key]}
              options={
                field.key === "stage" ? stageOptions : optionsFor(field.source)
              }
              onChange={(value) =>
                setFilters((current) => ({ ...current, [field.key]: value }))
              }
            />
          ))}
        </div>
        <div className="ui5-card-heading">
          <div>
            <h2>All Projects ({filtered.length})</h2>
          </div>
          <div className="overview-actions">
            <button
              className="settings-icon-button app-settings-button"
              type="button"
              onClick={openSettings}
              aria-label="Choose table fields"
              title="Table settings"
            ><SettingsIcon /></button>
            <button
              className="primary"
              onClick={download}
              disabled={!filtered.length || !shown.length}
            >
              Download Excel
            </button>
          </div>
        </div>
        {filtered.length && shown.length ? (
          <div className="all-projects-scroll">
            <DataTable headers={[...shown.map((column) => column.label), "Open"]}>
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="overview-project-row"
                  tabIndex={0}
                  onClick={() => loadProject(item.id)}
                  onKeyDown={event => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      loadProject(item.id);
                    }
                  }}
                  aria-label={`Open project ${item.id} in Project Details`}
                >
                  {shown.map((column) => (
                    <td key={column.key}>
                      {column.key === "id" ? (
                        <button
                          className="recent-project-id"
                          onClick={event => { event.stopPropagation(); loadProject(item.id); }}
                        >
                          {item.id}
                        </button>
                      ) : (
                        item[column.key] || "-"
                      )}
                    </td>
                  ))}
                  <td>
                    <button className="overview-open-project" type="button" onClick={event => { event.stopPropagation(); loadProject(item.id); }} aria-label={`Open project ${item.id} in Project Details`} title="Open Project Details">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </DataTable>
          </div>
        ) : projectsLoading ? (
          <div className="work-package-empty" role="status" aria-live="polite">
            <span className="api-loading-spinner" aria-hidden="true" />
            <strong>Loading projects...</strong>
          </div>
        ) : (
          <div className="work-package-empty">
            <strong>No projects found</strong>
            <span>Change the filter or selected fields.</span>
          </div>
        )}
      </section>
      {settingsOpen && (
        <div
          className="column-modal-backdrop"
          role="presentation"
          onMouseDown={cancelSettings}
        >
          <div
            className="column-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="column-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="column-modal-header">
              <h2 id="column-modal-title">View Settings</h2>
              <button
                className="column-reset"
                type="button"
                onClick={resetSettings}
              >
                Reset
              </button>
            </div>
            <div className="column-tabs">
              <button
                type="button"
                className={settingsTab === "columns" ? "active" : ""}
                onClick={() => setSettingsTab("columns")}
              >
                Columns
              </button>
              <button
                type="button"
                className={settingsTab === "sort" ? "active" : ""}
                onClick={() => setSettingsTab("sort")}
              >
                Sort
              </button>
            </div>
            {settingsTab === "columns" ? (
              <>
                <div className="column-search">
                  <input
                    value={columnSearch}
                    onChange={(event) => setColumnSearch(event.target.value)}
                    placeholder="Search columns"
                    autoFocus
                  />
                  <span aria-hidden="true">⌕</span>
                </div>
                <label className="column-select-all">
                  <input
                    type="checkbox"
                    checked={visible.length === columns.length}
                    onChange={(event) =>
                      setVisible(
                        event.target.checked
                          ? columns.map((column) => column.key)
                          : [],
                      )
                    }
                  />
                  <strong>
                    Columns ({visible.length}/{columns.length})
                  </strong>
                </label>
                <div className="column-list">
                  {searchedColumns.map((column) => (
                    <div
                      className={`column-choice${visible.includes(column.key) ? " selected" : ""}${draggedColumn === column.key ? " dragging" : ""}`}
                      key={column.key}
                      draggable
                      onDragStart={() => setDraggedColumn(column.key)}
                      onDragEnd={() => setDraggedColumn(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (draggedColumn) moveColumn(draggedColumn, column.key)
                        setDraggedColumn(null)
                      }}
                    >
                      <span className="column-drag-handle" aria-hidden="true">⋮⋮</span>
                      <label>
                        <input
                          type="checkbox"
                          checked={visible.includes(column.key)}
                          onChange={() => toggle(column.key)}
                        />
                        <span>{column.label}</span>
                      </label>
                    </div>
                  ))}
                  {!searchedColumns.length && (
                    <div className="column-empty">No matching columns</div>
                  )}
                </div>
              </>
            ) : (
              <div className="column-sort-list">
                {orderedColumns
                  .filter((column) => visible.includes(column.key))
                  .map((column, index, selectedColumns) => (
                    <div
                      className={`column-sort-row${draggedColumn === column.key ? " dragging" : ""}`}
                      key={column.key}
                      draggable
                      onDragStart={() => setDraggedColumn(column.key)}
                      onDragEnd={() => setDraggedColumn(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (draggedColumn)
                          moveColumn(draggedColumn, column.key);
                        setDraggedColumn(null);
                      }}
                    >
                      <span className="column-drag-handle" aria-hidden="true">
                        ⋮⋮
                      </span>
                      <span>{column.label}</span>
                      <div className="column-order-buttons">
                        <button
                          type="button"
                          disabled={index === 0}
                          aria-label={`Move ${column.label} up`}
                          title="Move up"
                          onClick={() =>
                            moveColumn(
                              column.key,
                              selectedColumns[index - 1].key,
                            )
                          }
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={index === selectedColumns.length - 1}
                          aria-label={`Move ${column.label} down`}
                          title="Move down"
                          onClick={() =>
                            moveColumn(
                              column.key,
                              selectedColumns[index + 1].key,
                            )
                          }
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
            <div className="column-modal-actions">
              <button
                className="primary"
                type="button"
                onClick={() => setSettingsOpen(false)}
              >
                OK
              </button>
              <button
                className="text-button"
                type="button"
                onClick={cancelSettings}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
