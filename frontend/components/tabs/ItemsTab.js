import { useMemo, useState } from "react";

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
            <tr key={item.id}>
              <td>
                <input
                  type="checkbox"
                  checked={selectedItemIds.includes(item.id)}
                  onChange={() => toggleSelectItem(item.id)}
                />
              </td>
              <td>{item.category || "Item"}</td>
              <td>
                <span className="item-icon" aria-hidden="true">{getItemIcon(item)}</span>{" "}
                {item.name || "Unknown"}
              </td>
              <td>{item.color || "Unknown"}</td>
              <td>{item.style_label || "Unknown"}</td>
            </tr>
          ))}
        </tbody>
      </table>

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
