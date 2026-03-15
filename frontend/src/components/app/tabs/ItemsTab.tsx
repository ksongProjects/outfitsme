"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useItemsContext } from "@/components/app/DashboardContext";
import BaseButton from "@/components/app/ui/BaseButton";
import BaseCheckbox from "@/components/app/ui/BaseCheckbox";
import BaseDialog from "@/components/app/ui/BaseDialog";
import BaseSelect from "@/components/app/ui/BaseSelect";
import { formatItemLabel, getItemIcon } from "@/lib/formatters";

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
    resetItemsState,
  } = useItemsContext();
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [colorFilter, setColorFilter] = useState("all");
  const [styleFilter, setStyleFilter] = useState("all");
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<(typeof items)[number] | null>(null);

  const normalizeFilterValue = (value: string | undefined) =>
    (value || "Unknown").trim().replace(/\s+/g, " ").toLowerCase();

  const buildUniqueOptions = (values: Array<string | undefined>) => {
    const map = new Map<string, string>();
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

  const getOptionLabel = (options: Array<{ value: string; label: string }>, selectedValue: string) =>
    options.find((option) => option.value === selectedValue)?.label || selectedValue;

  const categoryOptions = useMemo(() => buildUniqueOptions(items.map((item) => item.category)), [items]);
  const colorOptions = useMemo(() => buildUniqueOptions(items.map((item) => item.color)), [items]);
  const styleOptions = useMemo(() => buildUniqueOptions(items.map((item) => item.style_label)), [items]);

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const matchesCategory = categoryFilter === "all" || normalizeFilterValue(item.category) === categoryFilter;
        const matchesColor = colorFilter === "all" || normalizeFilterValue(item.color) === colorFilter;
        const matchesStyle = styleFilter === "all" || normalizeFilterValue(item.style_label) === styleFilter;
        return matchesCategory && matchesColor && matchesStyle;
      }),
    [items, categoryFilter, colorFilter, styleFilter]
  );

  const activeFilterChips = [
    categoryFilter !== "all" ? `Type: ${getOptionLabel(categoryOptions, categoryFilter)}` : "",
    colorFilter !== "all" ? `Color: ${getOptionLabel(colorOptions, colorFilter)}` : "",
    styleFilter !== "all" ? `Style: ${getOptionLabel(styleOptions, styleFilter)}` : "",
  ].filter(Boolean);

  const handleConfirmSelectedItems = async () => {
    try {
      await composeOutfitFromSelected();
      setConfirmModalOpen(false);
    } catch (error) {
      toast.error((error as Error).message || "Could not create outfit from selected items.");
    }
  };

  return (
    <section className="tab-stack">
      <div className="tab-header">
        <div className="tab-header-title">
          <span className="section-kicker">Catalog</span>
          <h2>Item catalog</h2>
          <p className="tab-header-subtext">Filter detected items, select the pieces you like, and build new outfits from them.</p>
        </div>
        <BaseButton variant="ghost" onClick={loadItems} disabled={itemsLoading}>
          {itemsLoading ? "Loading..." : "Refresh"}
        </BaseButton>
      </div>

      {itemsMessage ? <p className="subtext">{itemsMessage}</p> : null}

      <div className="filter-row">
        <BaseSelect
          value={categoryFilter}
          onValueChange={setCategoryFilter}
          options={[{ value: "all", label: "All types" }, ...categoryOptions]}
          placeholder="All types"
        />
        <BaseSelect
          value={colorFilter}
          onValueChange={setColorFilter}
          options={[{ value: "all", label: "All colors" }, ...colorOptions]}
          placeholder="All colors"
        />
        <BaseSelect
          value={styleFilter}
          onValueChange={setStyleFilter}
          options={[{ value: "all", label: "All styles" }, ...styleOptions]}
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
            <tr>
              <th>Select</th>
              <th>Category</th>
              <th>Name</th>
              <th>Color</th>
              <th>Style</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr
                key={item.id}
                className={selectedItemIds.includes(item.id) ? "table-row-selected" : ""}
                onClick={() => setActiveItem(item)}
              >
                <td>
                  <span onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
                    <BaseCheckbox checked={selectedItemIds.includes(item.id)} onCheckedChange={() => toggleSelectItem(item.id)} />
                  </span>
                </td>
                <td>{item.category || "Item"}</td>
                <td>
                  <span className="wardrobe-item-row">
                    {item.image_url ? <img src={item.image_url} alt={item.name || "Item"} className="item-thumb" /> : null}
                    <span className="item-icon" aria-hidden="true">{getItemIcon(item)}</span>
                    <span>{item.name || "Unknown"}</span>
                  </span>
                </td>
                <td>{item.color || "Unknown"}</td>
                <td>{item.style_label || "Unknown"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination-row">
        <p className="subtext">{selectedItems.length} item{selectedItems.length === 1 ? "" : "s"} selected</p>
        <div className="button-row">
          <BaseButton type="button" variant="ghost" onClick={resetItemsState} disabled={selectedItems.length === 0}>
            Unselect all
          </BaseButton>
          <BaseButton type="button" variant="primary" disabled={selectedItems.length === 0} onClick={() => setConfirmModalOpen(true)}>
            Create new outfit
          </BaseButton>
        </div>
      </div>

      <BaseDialog open={confirmModalOpen} onOpenChange={setConfirmModalOpen} title="Confirm new outfit">
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
              <BaseButton type="button" variant="primary" onClick={handleConfirmSelectedItems} disabled={composeOutfitLoading}>
                {composeOutfitLoading ? "Creating..." : "Confirm outfit"}
              </BaseButton>
            </div>
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={Boolean(activeItem)}
        onOpenChange={(open) => {
          if (!open) {
            setActiveItem(null);
          }
        }}
        title="Item details"
        size="fit"
      >
        {activeItem ? (
          <>
            {activeItem.image_url ? (
              <img src={activeItem.image_url} alt={activeItem.name || "Item"} className="modal-image" />
            ) : (
              <p className="subtext">Image generation disabled.</p>
            )}
            <ul className="compact-list">
              <li><strong>Name:</strong> {activeItem.name || "Unknown"}</li>
              <li><strong>Category:</strong> {activeItem.category || "Item"}</li>
              <li><strong>Color:</strong> {activeItem.color || "Unknown"}</li>
              <li><strong>Style:</strong> {activeItem.style_label || "Unknown"}</li>
            </ul>
          </>
        ) : null}
      </BaseDialog>
    </section>
  );
}

