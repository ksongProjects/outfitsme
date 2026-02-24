import { useEffect, useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable
} from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { formatItemLabel, getItemIcon } from "../../utils/formatters";
import { useSettingsContext, useWardrobeContext } from "../../context/DashboardContext";
import BaseButton from "../ui/BaseButton";
import BaseDialog from "../ui/BaseDialog";
import BaseInput from "../ui/BaseInput";

export default function OutfitsTab() {
  const { profilePhotoUrl } = useSettingsContext();
  const {
    wardrobe,
    wardrobeLoading,
    wardrobeMessage,
    loadWardrobe,
    deleteWardrobeEntry,
    deletingOutfitId,
    renameOutfit,
    updatingOutfitId,
    generateOutfitMe,
    outfitMeLoading,
    openOutfitDetails,
    closeOutfitDetails,
    outfitDetails,
    outfitDetailsLoading
  } = useWardrobeContext();
  const [pendingDelete, setPendingDelete] = useState(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [itemPreview, setItemPreview] = useState(null);

  useEffect(() => {
    const selectedStyle = outfitDetails?.selected_outfit?.style || "";
    setEditedName(selectedStyle);
    setIsEditingName(false);
  }, [outfitDetails?.selected_outfit?.outfit_id, outfitDetails?.selected_outfit?.style]);

  const handleDelete = async () => {
    if (!pendingDelete) {
      return;
    }
    const deleted = await deleteWardrobeEntry(pendingDelete.outfit_id);
    if (deleted) {
      setPendingDelete(null);
    }
  };

  const getOutfitDisplayName = (entry) => {
    const style = entry.style_label || "Unlabeled";
    if ((entry.outfit_count || 1) > 1) {
      return `${style} (${(entry.outfit_index || 0) + 1})`;
    }
    return style;
  };

  const columns = useMemo(() => [
    {
      accessorKey: "photo",
      header: "Photo",
      cell: ({ row }) => (
        row.original.image_url ? (
          <img src={row.original.image_url} alt={getOutfitDisplayName(row.original)} className="history-thumb" />
        ) : (
          <span className="subtext">-</span>
        )
      )
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => getOutfitDisplayName(row.original)
    },
    {
      accessorKey: "created_at",
      header: "Created",
      cell: ({ row }) => row.original.created_at ? new Date(row.original.created_at).toLocaleString() : "-"
    },
    {
      accessorKey: "action",
      header: "Action",
      cell: ({ row }) => (
        <BaseButton
          type="button"
          variant="icon"
          className="danger-icon-btn"
          onClick={(event) => {
            event.stopPropagation();
            setPendingDelete(row.original);
          }}
          disabled={deletingOutfitId === row.original.outfit_id}
          aria-label="Delete outfit"
          title="Delete outfit"
        >
          {deletingOutfitId === row.original.outfit_id ? "..." : <Trash2 size={16} />}
        </BaseButton>
      )
    }
  ], [deletingOutfitId]);

  const table = useReactTable({
    data: wardrobe,
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

  const handleSaveOutfitName = async () => {
    const outfitId = outfitDetails?.selected_outfit?.outfit_id;
    const nextName = editedName.trim();
    if (!outfitId || !nextName) {
      return;
    }
    const saved = await renameOutfit(outfitId, nextName);
    if (saved) {
      setIsEditingName(false);
    }
  };

  const handleGenerateOutfitMe = async () => {
    const details = outfitDetails || {};
    const selected = details.selected_outfit || null;
    if (!details.photo_id || !selected) {
      return;
    }
    if (!profilePhotoUrl) {
      toast.error("Profile photo is required for OutfitMe. Upload one in Settings > Profile.");
      return;
    }
    await generateOutfitMe(details.photo_id, selected.outfit_index);
  };

  return (
    <section>
      <div className="tab-header">
        <div className="tab-header-title">
          <h2>My Outfits</h2>
          <p className="tab-header-subtext">Browse saved looks and open outfit details.</p>
        </div>
        <BaseButton variant="ghost" onClick={() => loadWardrobe(true)} disabled={wardrobeLoading}>
          {wardrobeLoading ? "Loading..." : "Refresh"}
        </BaseButton>
      </div>

      {wardrobeMessage ? <p className="subtext">{wardrobeMessage}</p> : null}

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
                onClick={() => openOutfitDetails(row.original.photo_id, row.original.outfit_index)}
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
        </div>
      </div>

      <BaseDialog
        open={Boolean(outfitDetails || outfitDetailsLoading)}
        onOpenChange={(open) => {
          if (!open) {
            setIsEditingName(false);
            closeOutfitDetails();
          }
        }}
        title="Outfit details"
        headerActions={
          !outfitDetailsLoading && outfitDetails?.selected_outfit ? (
            <>
              <BaseButton
                type="button"
                variant="ghost"
                onClick={handleGenerateOutfitMe}
                disabled={outfitMeLoading}
                title={profilePhotoUrl ? "Generate OutfitMe preview" : "Profile photo required for OutfitMe"}
              >
                {outfitMeLoading ? "OutfitMe..." : "OutfitMe"}
              </BaseButton>
              {!isEditingName ? (
                <BaseButton
                  type="button"
                  variant="ghost"
                  onClick={() => setIsEditingName(true)}
                >
                  Edit
                </BaseButton>
              ) : null}
            </>
          ) : null
        }
      >
        {outfitDetailsLoading ? (
          <p className="subtext">Loading outfit details...</p>
        ) : (
          <div className="outfit-details-layout">
            {outfitDetails?.image_url ? (
              <img src={outfitDetails.image_url} alt="Original outfit" className="modal-image" />
            ) : (
              <p className="subtext">Original image is unavailable for this outfit.</p>
            )}
            {outfitDetails?.outfitme_image_url ? (
              <img src={outfitDetails.outfitme_image_url} alt="OutfitMe preview" className="modal-image" />
            ) : null}
            <div>
              <h4>
                Outfit {(outfitDetails?.selected_outfit?.outfit_index ?? 0) + 1}
              </h4>
              {outfitDetails?.selected_outfit ? (
                <div className="outfit-group">
                  {isEditingName ? (
                    <>
                      <label htmlFor="outfit-name-input"><strong>Name:</strong></label>
                      <BaseInput
                        id="outfit-name-input"
                        value={editedName}
                        onChange={(event) => setEditedName(event.target.value)}
                        placeholder="Outfit name"
                        maxLength={80}
                      />
                      <div className="button-row">
                        <BaseButton
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setEditedName(outfitDetails.selected_outfit.style || "");
                            setIsEditingName(false);
                          }}
                          disabled={updatingOutfitId === outfitDetails.selected_outfit.outfit_id}
                        >
                          Cancel
                        </BaseButton>
                        <BaseButton
                          type="button"
                          variant="primary"
                          onClick={handleSaveOutfitName}
                          disabled={
                            !editedName.trim()
                            || updatingOutfitId === outfitDetails.selected_outfit.outfit_id
                          }
                        >
                          {updatingOutfitId === outfitDetails.selected_outfit.outfit_id ? "Saving..." : "Save"}
                        </BaseButton>
                      </div>
                    </>
                  ) : (
                    <p>
                      <strong>Name:</strong> {outfitDetails.selected_outfit.style || "Unlabeled"}
                    </p>
                  )}
                  {(outfitDetails.selected_outfit.items || []).length ? (
                    <ul className="analysis-items">
                      {outfitDetails.selected_outfit.items.map((item, index) => (
                        <li key={`detail-item-${outfitDetails.selected_outfit.outfit_index}-${index}`} className="analysis-item">
                          <span className="wardrobe-item-row">
                            {item.image_url ? (
                              <BaseButton
                                type="button"
                                variant="ghost"
                                className="history-thumb-btn"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setItemPreview({
                                    image_url: item.image_url,
                                    name: item.name || "Outfit item"
                                  });
                                }}
                                aria-label="Open item image preview"
                                title="Open item image preview"
                              >
                                <img src={item.image_url} alt={item.name || "Outfit item"} className="item-thumb" />
                              </BaseButton>
                            ) : null}
                            <span className="item-icon" aria-hidden="true">{getItemIcon(item)}</span>
                            <span>{item.name || formatItemLabel(item)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="subtext">No items were stored for this outfit.</p>
                  )}
                </div>
              ) : (
                <p className="subtext">The selected outfit could not be loaded for this photo.</p>
              )}
            </div>
          </div>
        )}
      </BaseDialog>

      <BaseDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
        title="Delete outfit"
        size="sm"
      >
        <p>Remove this outfit from your wardrobe?</p>
        <p className="subtext">
          Style: <strong>{pendingDelete?.style_label || "Unlabeled"}</strong>
        </p>
        <div className="button-row">
          <BaseButton
            type="button"
            variant="ghost"
            onClick={() => setPendingDelete(null)}
            disabled={deletingOutfitId === pendingDelete?.outfit_id}
          >
            Cancel
          </BaseButton>
          <BaseButton
            type="button"
            variant="ghost"
            className="danger-btn"
            onClick={handleDelete}
            disabled={deletingOutfitId === pendingDelete?.outfit_id}
          >
            {deletingOutfitId === pendingDelete?.outfit_id ? "Deleting..." : "Delete"}
          </BaseButton>
        </div>
      </BaseDialog>

      <BaseDialog
        open={Boolean(itemPreview)}
        onOpenChange={(open) => setItemPreview(open ? itemPreview : null)}
        title={itemPreview?.name || "Item preview"}
        size="sm"
      >
        {itemPreview?.image_url ? (
          <img src={itemPreview.image_url} alt={itemPreview.name || "Item preview"} className="modal-image" />
        ) : (
          <p className="subtext">Preview unavailable for this item.</p>
        )}
      </BaseDialog>
    </section>
  );
}
