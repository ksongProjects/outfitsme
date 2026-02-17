import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable
} from "@tanstack/react-table";

import { formatItemLabel, getItemIcon } from "../../utils/formatters";
import { useItemsContext } from "../../context/DashboardContext";

export default function ItemsTab() {
  const {
    items,
    itemsLoading,
    itemsMessage,
    loadItems,
    selectedItemIds,
    toggleSelectItem,
    selectedItems
  } = useItemsContext();
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [colorFilter, setColorFilter] = useState("all");
  const [styleFilter, setStyleFilter] = useState("all");

  const categoryOptions = useMemo(() => {
    const options = [...new Set(items.map((item) => (item.category || "Unknown").trim() || "Unknown"))];
    return options.sort((a, b) => a.localeCompare(b));
  }, [items]);

  const colorOptions = useMemo(() => {
    const options = [...new Set(items.map((item) => (item.color || "Unknown").trim() || "Unknown"))];
    return options.sort((a, b) => a.localeCompare(b));
  }, [items]);

  const styleOptions = useMemo(() => {
    const options = [...new Set(items.map((item) => (item.style_label || "Unknown").trim() || "Unknown"))];
    return options.sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredItems = useMemo(() => (
    items.filter((item) => {
      const matchesCategory = categoryFilter === "all" || (item.category || "Unknown") === categoryFilter;
      const matchesColor = colorFilter === "all" || (item.color || "Unknown") === colorFilter;
      const matchesStyle = styleFilter === "all" || (item.style_label || "Unknown") === styleFilter;
      return matchesCategory && matchesColor && matchesStyle;
    })
  ), [items, categoryFilter, colorFilter, styleFilter]);

  const activeFilterChips = [
    categoryFilter !== "all" ? `Type: ${categoryFilter}` : "",
    colorFilter !== "all" ? `Color: ${colorFilter}` : "",
    styleFilter !== "all" ? `Style: ${styleFilter}` : ""
  ].filter(Boolean);

  const columns = useMemo(() => [
    {
      accessorKey: "select",
      header: "Select",
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={selectedItemIds.includes(row.original.id)}
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

  return (
    <section>
      <div className="toolbar-row">
        <h2>Item catalog</h2>
        <button className="ghost-btn" onClick={loadItems} disabled={itemsLoading}>
          {itemsLoading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {itemsMessage ? <p className="subtext">{itemsMessage}</p> : null}

      <div className="filter-row">
        <select className="text-input" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="all">All types</option>
          {categoryOptions.map((category) => (
            <option key={`category-${category}`} value={category}>{category}</option>
          ))}
        </select>
        <select className="text-input" value={colorFilter} onChange={(event) => setColorFilter(event.target.value)}>
          <option value="all">All colors</option>
          {colorOptions.map((color) => (
            <option key={`color-${color}`} value={color}>{color}</option>
          ))}
        </select>
        <select className="text-input" value={styleFilter} onChange={(event) => setStyleFilter(event.target.value)}>
          <option value="all">All styles</option>
          {styleOptions.map((style) => (
            <option key={`style-${style}`} value={style}>{style}</option>
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
              <tr key={row.id}>
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
        </div>
      </div>

      <div className="combine-panel">
        <h3>New outfit (selected items)</h3>
        {selectedItems.length === 0 ? (
          <p className="subtext">Select any number of items to combine a new outfit.</p>
        ) : (
          <ul>
            {selectedItems.map((item) => (
              <li key={`selected-${item.id}`}>{formatItemLabel(item)}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
