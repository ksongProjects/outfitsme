import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable
} from "@tanstack/react-table";
import { toast } from "sonner";

import { formatItemLabel, getItemIcon } from "../../utils/formatters";
import { useItemsContext } from "../../context/DashboardContext";

export default function ItemsTab() {
  const {
    items,
    itemsLoading,
    itemsMessage,
    loadItems,
    composeOutfitFromSelected,
    composeOutfitLoading,
    selectedItemIds,
    toggleSelectItem,
    selectedItems
  } = useItemsContext();
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [colorFilter, setColorFilter] = useState("all");
  const [styleFilter, setStyleFilter] = useState("all");
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  const normalizeFilterValue = (value) => (
    (value || "Unknown").trim().replace(/\s+/g, " ").toLowerCase()
  );

  const buildUniqueOptions = (values) => {
    const map = new Map();
    for (const rawValue of values) {
      const label = (rawValue || "Unknown").trim().replace(/\s+/g, " ") || "Unknown";
      const normalized = normalizeFilterValue(label);
      if (!map.has(normalized)) {
        map.set(normalized, label);
      }
    }
    return [...map.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }));
  };

  const getOptionLabel = (options, selectedValue) => (
    options.find((option) => option.value === selectedValue)?.label || selectedValue
  );

  const categoryOptions = useMemo(() => {
    return buildUniqueOptions(items.map((item) => item.category));
  }, [items]);

  const colorOptions = useMemo(() => {
    return buildUniqueOptions(items.map((item) => item.color));
  }, [items]);

  const styleOptions = useMemo(() => {
    return buildUniqueOptions(items.map((item) => item.style_label));
  }, [items]);

  const filteredItems = useMemo(() => (
    items.filter((item) => {
      const matchesCategory = categoryFilter === "all" || normalizeFilterValue(item.category) === categoryFilter;
      const matchesColor = colorFilter === "all" || normalizeFilterValue(item.color) === colorFilter;
      const matchesStyle = styleFilter === "all" || normalizeFilterValue(item.style_label) === styleFilter;
      return matchesCategory && matchesColor && matchesStyle;
    })
  ), [items, categoryFilter, colorFilter, styleFilter]);

  const activeFilterChips = [
    categoryFilter !== "all" ? `Type: ${getOptionLabel(categoryOptions, categoryFilter)}` : "",
    colorFilter !== "all" ? `Color: ${getOptionLabel(colorOptions, colorFilter)}` : "",
    styleFilter !== "all" ? `Style: ${getOptionLabel(styleOptions, styleFilter)}` : ""
  ].filter(Boolean);

  const columns = useMemo(() => [
    {
      accessorKey: "select",
      header: "Select",
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={selectedItemIds.includes(row.original.id)}
          onClick={(event) => event.stopPropagation()}
          onChange={() => toggleSelectItem(row.original.id)}
        />
      )
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => row.original.category || "Item"
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span>
          <span className="item-icon" aria-hidden="true">{getItemIcon(row.original)}</span>{" "}
          {row.original.name || "Unknown"}
        </span>
      )
    },
    {
      accessorKey: "color",
      header: "Color",
      cell: ({ row }) => row.original.color || "Unknown"
    },
    {
      accessorKey: "style_label",
      header: "Style",
      cell: ({ row }) => row.original.style_label || "Unknown"
    }
  ], [selectedItemIds, toggleSelectItem]);

  const table = useReactTable({
    data: filteredItems,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 10
      }
    }
  });

  const handleConfirmSelectedItems = async () => {
    try {
      await composeOutfitFromSelected();
      setConfirmModalOpen(false);
    } catch (err) {
      toast.error(err.message || "Could not create outfit from selected items.");
    }
  };

  return (
    <section>
      <div className="tab-header">
        <div className="tab-header-title">
          <h2>Item catalog</h2>
          <p className="tab-header-subtext">Filter, select, and compose outfits from saved items.</p>
        </div>
        <button className="ghost-btn" onClick={loadItems} disabled={itemsLoading}>
          {itemsLoading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {itemsMessage ? <p className="subtext">{itemsMessage}</p> : null}

      <div className="filter-row">
        <select className="text-input" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="all">All types</option>
          {categoryOptions.map((category) => (
            <option key={`category-${category.value}`} value={category.value}>{category.label}</option>
          ))}
        </select>
        <select className="text-input" value={colorFilter} onChange={(event) => setColorFilter(event.target.value)}>
          <option value="all">All colors</option>
          {colorOptions.map((color) => (
            <option key={`color-${color.value}`} value={color.value}>{color.label}</option>
          ))}
        </select>
        <select className="text-input" value={styleFilter} onChange={(event) => setStyleFilter(event.target.value)}>
          <option value="all">All styles</option>
          {styleOptions.map((style) => (
            <option key={`style-${style.value}`} value={style.value}>{style.label}</option>
          ))}
        </select>
        <button
          type="button"
          className="ghost-btn"
          onClick={() => {
            setCategoryFilter("all");
            setColorFilter("all");
            setStyleFilter("all");
          }}
        >
          Clear filters
        </button>
      </div>

      {activeFilterChips.length > 0 ? (
        <div className="filter-chips">
          {activeFilterChips.map((chip) => (
            <span key={chip} className="filter-chip">{chip}</span>
          ))}
        </div>
      ) : null}

      <div className="table-scroll-wrap">
        <table className="data-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={selectedItemIds.includes(row.original.id) ? "table-row-selected" : ""}
                onClick={() => toggleSelectItem(row.original.id)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination-row">
        <p className="subtext">
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
        </p>
        <div className="button-row">
          <button type="button" className="ghost-btn" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Previous
          </button>
          <button type="button" className="ghost-btn" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Next
          </button>
          <button
            type="button"
            className="primary-btn"
            disabled={selectedItems.length === 0}
            onClick={() => setConfirmModalOpen(true)}
          >
            Create new outfit
          </button>
        </div>
      </div>

      {confirmModalOpen ? (
        <div className="modal-backdrop" onClick={() => setConfirmModalOpen(false)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Confirm new outfit</h3>
              <button type="button" className="ghost-btn" onClick={() => setConfirmModalOpen(false)}>Close</button>
            </div>
            <div className="outfit-details-layout">
              <div className="selection-preview">
                <h4>Preview</h4>
                <p className="subtext">{selectedItems.length} item{selectedItems.length === 1 ? "" : "s"} selected</p>
                <div className="selection-preview-grid">
                  {selectedItems.map((item) => (
                    <div key={`preview-${item.id}`} className="selection-preview-pill">
                      <span className="item-icon" aria-hidden="true">{getItemIcon(item)}</span>
                      <span>{item.name || "Unknown"}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4>Selected items</h4>
                <ul className="analysis-items">
                  {selectedItems.map((item) => (
                    <li key={`selected-${item.id}`} className="analysis-item">
                      <span className="item-icon" aria-hidden="true">{getItemIcon(item)}</span>
                      <span>{formatItemLabel(item)}</span>
                    </li>
                  ))}
                </ul>
                <div className="button-row">
                  <button type="button" className="ghost-btn" onClick={() => setConfirmModalOpen(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={handleConfirmSelectedItems}
                    disabled={composeOutfitLoading}
                  >
                    {composeOutfitLoading ? "Creating..." : "Confirm outfit"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
