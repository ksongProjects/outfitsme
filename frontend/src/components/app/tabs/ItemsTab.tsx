"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useItemsContext, useWardrobeContext } from "@/components/app/DashboardContext";
import AppImage from "@/components/app/ui/AppImage";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatItemLabel, getItemIcon } from "@/lib/formatters";

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

export default function ItemsTab() {
  const {
    items,
    itemsLoading,
    itemsMessage,
    refreshItems,
    itemsPage,
    itemsHasMore,
    nextItemsPage,
    prevItemsPage,
    composeOutfitFromSelected,
    composeOutfitLoading,
    selectedItemIds,
    toggleSelectItem,
    selectedItems,
    resetItemsState,
  } = useItemsContext();
  const { openOutfitDetails } = useWardrobeContext();
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [colorFilter, setColorFilter] = useState("all");
  const [styleFilter, setStyleFilter] = useState("all");
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<(typeof items)[number] | null>(null);

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
  const hasFilteredItems = filteredItems.length > 0;
  const shouldShowEmptyState = !itemsLoading && !hasFilteredItems;
  const emptyStateMessage = items.length === 0
    ? itemsMessage || "No items yet. Analyze an outfit to populate your item catalog."
    : activeFilterChips.length > 0
      ? "No items match the selected filters."
      : "No items are available on this page.";

  const handleConfirmSelectedItems = async () => {
    try {
      const result = await composeOutfitFromSelected();
      setConfirmModalOpen(false);
      if (result?.photo_id) {
        openOutfitDetails(
          String(result.photo_id),
          typeof result.outfit_index === "number" ? result.outfit_index : 0
        );
      }
    } catch (error) {
      toast.error((error as Error).message || "Could not create outfit from selected items.");
    }
  };

  return (
    <section className="o-stack o-stack--section">
      <div className="tab-header">
        <div className="tab-header-title">
          <span className="section-kicker">Catalog</span>
          <h2>Item catalog</h2>
          <p className="tab-header-subtext">Filter detected items, select the pieces you like, and build new outfits from them.</p>
        </div>
        <Button variant="outline" onClick={() => void refreshItems()} disabled={itemsLoading}>
          {itemsLoading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      {itemsMessage && hasFilteredItems ? <p className="subtext">{itemsMessage}</p> : null}

      <div className="o-cluster o-cluster--wrap o-cluster--stack-sm">
        <Select
          value={categoryFilter}
          onValueChange={(nextValue) => {
            if (!nextValue) {
              return;
            }
            setCategoryFilter(nextValue);
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            {[{ value: "all", label: "All types" }, ...categoryOptions].map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={colorFilter}
          onValueChange={(nextValue) => {
            if (!nextValue) {
              return;
            }
            setColorFilter(nextValue);
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="All colors" />
          </SelectTrigger>
          <SelectContent>
            {[{ value: "all", label: "All colors" }, ...colorOptions].map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={styleFilter}
          onValueChange={(nextValue) => {
            if (!nextValue) {
              return;
            }
            setStyleFilter(nextValue);
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="All styles" />
          </SelectTrigger>
          <SelectContent>
            {[{ value: "all", label: "All styles" }, ...styleOptions].map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setCategoryFilter("all");
            setColorFilter("all");
            setStyleFilter("all");
          }}
        >
          Clear filters
        </Button>
      </div>

      {activeFilterChips.length > 0 ? (
        <div className="filter-chips">
          {activeFilterChips.map((chip) => (
            <span key={chip} className="filter-chip">{chip}</span>
          ))}
        </div>
      ) : null}

      {shouldShowEmptyState ? (
        <div className="table-empty-state" role="status" aria-live="polite">
          <p className="subtext">{emptyStateMessage}</p>
        </div>
      ) : (
        <div className="table-scroll-wrap item-catalog-table-wrap">
          <table className="data-table item-catalog-table">
            <thead>
              <tr>
                <th>Select</th>
                <th>Category</th>
                <th>Image</th>
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
                  <td data-label="Select">
                    <span onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
                      <Checkbox checked={selectedItemIds.includes(item.id)} onCheckedChange={() => toggleSelectItem(item.id)} />
                    </span>
                  </td>
                  <td data-label="Category">{item.category || "Item"}</td>
                  <td data-label="Image">
                    {item.image_url ? (
                      <AppImage
                        src={item.image_url}
                        alt={item.name || "Item"}
                        className="item-thumb"
                        width={48}
                        height={48}
                      />
                    ) : (
                      <span className="subtext">-</span>
                    )}
                  </td>
                  <td data-label="Name">
                    <span className="item-catalog-name">
                      <span className="item-icon" aria-hidden="true">{getItemIcon(item)}</span>
                      <span>{item.name || "Unknown"}</span>
                    </span>
                  </td>
                  <td data-label="Color">{item.color || "Unknown"}</td>
                  <td data-label="Style">{item.style_label || "Unknown"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="o-cluster o-cluster--between o-cluster--wrap o-cluster--stack-sm">
        <p className="subtext">Page {itemsPage}</p>
        <div className="o-cluster o-cluster--wrap o-cluster--stack-sm">
          <Button type="button" variant="outline" onClick={prevItemsPage} disabled={itemsLoading || itemsPage <= 1}>
            Previous
          </Button>
          <Button type="button" variant="outline" onClick={nextItemsPage} disabled={itemsLoading || !itemsHasMore}>
            Next
          </Button>
        </div>
      </div>

      <div className="o-cluster o-cluster--between o-cluster--wrap o-cluster--stack-sm">
        <p className="subtext">{selectedItems.length} item{selectedItems.length === 1 ? "" : "s"} selected</p>
        <div className="o-cluster o-cluster--wrap o-cluster--stack-sm">
          <Button type="button" variant="outline" onClick={resetItemsState} disabled={selectedItems.length === 0}>
            Unselect all
          </Button>
          <Button type="button" disabled={selectedItems.length === 0} onClick={() => setConfirmModalOpen(true)}>
            Create new outfit
          </Button>
        </div>
      </div>

      <Dialog open={confirmModalOpen} onOpenChange={setConfirmModalOpen}>
        <DialogContent className="modal-panel">
          <DialogHeader className="modal-header o-split o-split--start">
            <DialogTitle className="modal-title">Confirm new outfit</DialogTitle>
          </DialogHeader>
          <div className="modal-body">
            <div className="o-stack o-stack--tight">
              <h4>Selected items</h4>
              <p className="subtext">{selectedItems.length} item{selectedItems.length === 1 ? "" : "s"} selected</p>
              <ul className="o-list">
                {selectedItems.map((item) => (
                  <li key={`selected-${item.id}`} className="analysis-item">
                    <span className="item-icon" aria-hidden="true">{getItemIcon(item)}</span>
                    <span>{formatItemLabel(item)}</span>
                  </li>
                ))}
              </ul>
              <div className="o-cluster o-cluster--wrap o-cluster--stack-sm">
                <Button type="button" variant="outline" onClick={() => setConfirmModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleConfirmSelectedItems} disabled={composeOutfitLoading}>
                  {composeOutfitLoading ? (
                    <>
                      <span className="loading-spinner" aria-hidden="true" />
                      Creating...
                    </>
                  ) : "Confirm outfit"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(activeItem)}
        onOpenChange={(open) => {
          if (!open) {
            setActiveItem(null);
          }
        }}
      >
        <DialogContent className="modal-panel modal-panel-fit">
          <DialogHeader className="modal-header o-split o-split--start">
            <DialogTitle className="modal-title">Item details</DialogTitle>
          </DialogHeader>
          <div className="modal-body">
            {activeItem ? (
              <>
                {activeItem.image_url ? (
                  <AppImage
                    src={activeItem.image_url}
                    alt={activeItem.name || "Item"}
                    className="modal-image"
                    width={1600}
                    height={2000}
                  />
                ) : (
                  <p className="subtext">Image generation disabled.</p>
                )}
                <ul className="o-list o-list--split">
                  <li><strong>Name:</strong> {activeItem.name || "Unknown"}</li>
                  <li><strong>Category:</strong> {activeItem.category || "Item"}</li>
                  <li><strong>Color:</strong> {activeItem.color || "Unknown"}</li>
                  <li><strong>Style:</strong> {activeItem.style_label || "Unknown"}</li>
                </ul>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}



