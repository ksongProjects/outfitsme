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
import BaseButton from "../ui/BaseButton";
import BaseCheckbox from "../ui/BaseCheckbox";
import BaseDialog from "../ui/BaseDialog";
import BaseSelect from "../ui/BaseSelect";

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
    selectedItems,
    resetItemsState
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
        <span
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <BaseCheckbox
            checked={selectedItemIds.includes(row.original.id)}
            onCheckedChange={() => toggleSelectItem(row.original.id)}
          />
        </span>
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
        <BaseButton variant="ghost" onClick={loadItems} disabled={itemsLoading}>
          {itemsLoading ? "Loading..." : "Refresh"}
        </BaseButton>
      </div>

      {itemsMessage ? <p className="subtext">{itemsMessage}</p> : null}

      <div className="filter-row">
        <BaseSelect
          value={categoryFilter}
          onValueChange={(nextValue) => setCategoryFilter(nextValue)}
          options={[
            { value: "all", label: "All types" },
            ...categoryOptions.map((category) => ({ value: category.value, label: category.label }))
          ]}
          placeholder="All types"
        />
        <BaseSelect
          value={colorFilter}
          onValueChange={(nextValue) => setColorFilter(nextValue)}
          options={[
            { value: "all", label: "All colors" },
            ...colorOptions.map((color) => ({ value: color.value, label: color.label }))
          ]}
          placeholder="All colors"
        />
        <BaseSelect
          value={styleFilter}
          onValueChange={(nextValue) => setStyleFilter(nextValue)}
          options={[
            { value: "all", label: "All styles" },
            ...styleOptions.map((style) => ({ value: style.value, label: style.label }))
          ]}
          placeholder="All styles"
        />
        <BaseButton
          type="button"
          variant="ghost"
          onClick={() => {
            setCategoryFilter("all");
            setColorFilter("all");
            setStyleFilter("all");
          }}
        >
          Clear filters
        </BaseButton>
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
          <BaseButton type="button" variant="ghost" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Previous
          </BaseButton>
          <BaseButton type="button" variant="ghost" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Next
          </BaseButton>
          <BaseButton
            type="button"
            variant="ghost"
            onClick={resetItemsState}
            disabled={selectedItems.length === 0}
          >
            Unselect all
          </BaseButton>
          <BaseButton
            type="button"
            variant="primary"
            disabled={selectedItems.length === 0}
            onClick={() => setConfirmModalOpen(true)}
          >
            Create new outfit
          </BaseButton>
        </div>
      </div>

      <BaseDialog
        open={confirmModalOpen}
        onOpenChange={(open) => setConfirmModalOpen(open)}
        title="Confirm new outfit"
      >
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
              <BaseButton type="button" variant="ghost" onClick={() => setConfirmModalOpen(false)}>
                Cancel
              </BaseButton>
              <BaseButton
                type="button"
                variant="primary"
                onClick={handleConfirmSelectedItems}
                disabled={composeOutfitLoading}
              >
                {composeOutfitLoading ? "Creating..." : "Confirm outfit"}
              </BaseButton>
            </div>
          </div>
        </div>
      </BaseDialog>
    </section>
  );
}
