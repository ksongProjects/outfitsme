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
import BaseButton from "../../components/ui/BaseButton";
import BaseDialog from "../../components/ui/BaseDialog";
import BaseInput from "../../components/ui/BaseInput";
import BaseSelect from "../../components/ui/BaseSelect";

const OUTFIT_SOURCE_LABELS = {
  photo_analysis: "Photo analysis",
  custom_outfit: "Custom outfit",
  outfitsme_generated: "OutfitsMe generated"
};

export default function OutfitsTab() {
  const { profilePhotoUrl, settingsForm } = useSettingsContext();
  const {
    wardrobe,
    wardrobeLoading,
    wardrobeMessage,
    loadWardrobe,
    deleteWardrobeEntry,
    deletingOutfitId,
    renameOutfit,
    updatingOutfitId,
    generateOutfitsMe,
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
  const [sourceFilter, setSourceFilter] = useState("all");
  const imageGenerationEnabled = Boolean(settingsForm?.enable_outfit_image_generation);

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

  const filteredWardrobe = useMemo(() => (
    wardrobe.filter((entry) => sourceFilter === "all" || (entry.source_type || "photo_analysis") === sourceFilter)
  ), [wardrobe, sourceFilter]);

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
      accessorKey: "source_type",
      header: "Type",
      cell: ({ row }) => OUTFIT_SOURCE_LABELS[row.original.source_type] || "Photo analysis"
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
    data: filteredWardrobe,
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

  const handleGenerateOutfitsMe = async () => {
    const details = outfitDetails || {};
    const selected = details.selected_outfit || null;
    if (!details.photo_id || !selected) {
      return;
    }
    if (!imageGenerationEnabled) {
      toast.error("Outfit image generation is off. Enable it in Settings > Features.");
      return;
    }
    if (!profilePhotoUrl) {
      toast.error("Profile photo is required for OutfitsMe. Upload one in Settings > Profile.");
      return;
    }
    await generateOutfitsMe(details.photo_id, selected.outfit_index);
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

      <div className="filter-row">
        <BaseSelect
          value={sourceFilter}
          onValueChange={(nextValue) => setSourceFilter(nextValue)}
          options={[
            { value: "all", label: "All outfit types" },
            { value: "photo_analysis", label: "Photo analysis" },
            { value: "custom_outfit", label: "Custom outfit" },
            { value: "outfitsme_generated", label: "OutfitsMe generated" }
          ]}
          placeholder="All outfit types"
        />
        <BaseButton type="button" variant="ghost" onClick={() => setSourceFilter("all")}>
          Clear filters
        </BaseButton>
      </div>

      {wardrobe.length > 0 && filteredWardrobe.length === 0 ? (
        <p className="subtext">No outfits match the selected type filter.</p>
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
        scrollable={false}
        headerActions={
          !outfitDetailsLoading && outfitDetails?.selected_outfit ? (
            <>
              <BaseButton
                type="button"
                variant="ghost"
                onClick={handleGenerateOutfitsMe}
                disabled={outfitMeLoading || !imageGenerationEnabled}
                title={
                  !imageGenerationEnabled
                      ? "Enable Outfit image generation in Settings > Features"
                      : profilePhotoUrl
                        ? "Generate OutfitsMe preview"
                        : "Profile photo required for OutfitsMe"
                }
              >
                {outfitMeLoading ? "OutfitsMe..." : "OutfitsMe"}
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
            {outfitDetails?.source_outfit_image_url ? (
              <img src={outfitDetails.source_outfit_image_url} alt="Source outfit" className="modal-image outfit-detail-image" />
            ) : null}
            {outfitDetails?.image_url ? (
              <img src={outfitDetails.image_url} alt="Original outfit" className="modal-image outfit-detail-image" />
            ) : (
              <p className="subtext">Original image is unavailable for this outfit.</p>
            )}
            {outfitDetails?.outfitsme_image_url ? (
              <img src={outfitDetails.outfitsme_image_url} alt="OutfitsMe preview" className="modal-image outfit-detail-image" />
            ) : null}
            <div>
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
                  <p>
                    <strong>Type:</strong> {OUTFIT_SOURCE_LABELS[outfitDetails.selected_outfit.source_type] || "Photo analysis"}
                  </p>
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
        size="image"
        scrollable={false}
      >
        {itemPreview?.image_url ? (
          <img src={itemPreview.image_url} alt={itemPreview.name || "Item preview"} className="modal-image item-preview-image" />
        ) : (
          <p className="subtext">Preview unavailable for this item.</p>
        )}
      </BaseDialog>
    </section>
  );
}

