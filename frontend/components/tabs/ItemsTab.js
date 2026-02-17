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

  return (
    <section>
      <div className="toolbar-row">
        <h2>Item catalog</h2>
        <button className="ghost-btn" onClick={loadItems} disabled={itemsLoading}>
          {itemsLoading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {itemsMessage ? <p className="subtext">{itemsMessage}</p> : null}

      <table className="data-table">
        <thead>
          <tr>
            <th>Select</th>
            <th>Category</th>
            <th>Name</th>
            <th>Color</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
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
