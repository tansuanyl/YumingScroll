import { useMemo, useState, type ReactNode } from "react";
import { Archive, ArrowRight, Download, Film, FolderOpen, ImageIcon, MapPinned, Palette, Play, Trash2, UserRound, X } from "lucide-react";
import { apiClient } from "../lib/apiClient";
import { getProjectGalleryGroups, getProjectGallerySections, type GalleryImageItem } from "../lib/projectGallery";
import { createWorkflowModelSourceFromGalleryAsset, type WorkflowModelKind } from "../lib/workflowConnections";
import type { PageKey, Project } from "../types/domain";

type ProjectOverviewProps = {
  project: Project;
  projectCatalog?: Project[];
  onSelectProject?: (projectId: string) => void;
  onProjectChange: (project: Project) => void;
  onSave: (project: Project, message?: string) => Promise<void>;
  onAssistantMessage: (message: string) => void;
  onNavigate: (page: PageKey) => void;
};

const historyPreviewLimit = 8;

export function ProjectOverview({
  project,
  projectCatalog = [],
  onSelectProject,
  onProjectChange,
  onSave,
  onAssistantMessage,
  onNavigate
}: ProjectOverviewProps) {
  const [previewFlowId, setPreviewFlowId] = useState<string | null>(null);
  const [busyGalleryAction, setBusyGalleryAction] = useState<string | null>(null);
  const gallery = useMemo(() => getProjectGallerySections(project), [project]);
  const galleryProjects = useMemo(() => {
    const hasActiveProject = projectCatalog.some((item) => item.id === project.id);
    return hasActiveProject ? projectCatalog : [project, ...projectCatalog];
  }, [project, projectCatalog]);
  const galleryGroups = useMemo(() => getProjectGalleryGroups(galleryProjects, project.id), [galleryProjects, project.id]);
  const generatedVideos = gallery.videos;
  const selectedVideo = generatedVideos.find((item) => item.flow.id === previewFlowId);
  const projectAssetIds = useMemo(() => new Set(project.assets.map((asset) => asset.id)), [project.assets]);
  const characterModelAssetIds = useMemo(
    () => new Set(project.characterModels.flatMap((model) => (model.confirmedImageId ? [model.confirmedImageId] : []))),
    [project.characterModels]
  );
  const sceneModelAssetIds = useMemo(
    () => new Set(project.sceneModels.flatMap((model) => (model.confirmedImageId ? [model.confirmedImageId] : []))),
    [project.sceneModels]
  );
  const persistedAssetIds = useMemo(
    () =>
      new Set(
        project.assets
          .filter((asset) => asset.storageKey || asset.url.includes(`/api/projects/${encodeURIComponent(project.id)}/assets/`))
          .map((asset) => asset.id)
      ),
    [project.assets, project.id]
  );
  const totalAssets =
    gallery.characterImages.length +
    gallery.sceneImages.length +
    gallery.styleImages.length +
    gallery.historyImages.length +
    gallery.archivedCharacterImages.length +
    gallery.archivedSceneImages.length +
    gallery.archivedStyleImages.length +
    gallery.uncategorizedImages.length +
    generatedVideos.length;

  const getDownloadHref = (assetId: string, url: string) => {
    return projectAssetIds.has(assetId) ? apiClient.assetDownloadUrl(project.id, assetId) : url;
  };
  const getPreviewHref = (assetId: string, url: string) => {
    return persistedAssetIds.has(assetId) ? apiClient.assetFileUrl(project.id, assetId) : url;
  };
  const isGalleryActionBusy = (item: GalleryImageItem, kind: WorkflowModelKind) => busyGalleryAction === getGalleryActionKey(item, kind);
  const isDeleteBusy = (assetId: string) => busyGalleryAction === getGalleryDeleteKey(assetId);
  const isAlreadyWorkflowModel = (item: GalleryImageItem, kind: WorkflowModelKind) =>
    kind === "character" ? characterModelAssetIds.has(item.asset.id) : sceneModelAssetIds.has(item.asset.id);

  async function addGalleryImageToFlowMap(item: GalleryImageItem, kind: WorkflowModelKind) {
    const actionKey = getGalleryActionKey(item, kind);
    const label = kind === "character" ? "人物模型" : "场景模型";

    if (isAlreadyWorkflowModel(item, kind)) {
      onAssistantMessage(`这张图已经是 ${label}，已切到 Flow Map。`);
      onNavigate("flow");
      return;
    }

    const nextProject = createWorkflowModelSourceFromGalleryAsset(project, kind, {
      asset: item.asset,
      title: item.title,
      description: item.subtitle
    });
    if (nextProject === project) {
      onAssistantMessage(`这张图暂时不能加入为 ${label}。`);
      return;
    }

    setBusyGalleryAction(actionKey);
    onProjectChange(nextProject);
    try {
      await onSave(nextProject, `已将「${item.title}」加入 Flow Map，生成新的${label}框体。`);
      onNavigate("flow");
    } catch (error) {
      onProjectChange(project);
      onAssistantMessage(error instanceof Error ? error.message : `加入 ${label} 失败`);
    } finally {
      setBusyGalleryAction(null);
    }
  }

  async function deleteGalleryAsset(assetId: string, title: string) {
    const confirmed = window.confirm(`删除「${title}」？相关候选图、确认图或视频引用也会从当前项目里移除。`);
    if (!confirmed) return;

    const actionKey = getGalleryDeleteKey(assetId);
    setBusyGalleryAction(actionKey);
    try {
      const nextProject = await apiClient.deleteProjectAsset(project.id, assetId);
      onProjectChange(nextProject);
      if (selectedVideo?.asset.id === assetId) setPreviewFlowId(null);
      onAssistantMessage(`已从 Gallery 删除「${title}」。`);
    } catch (error) {
      onAssistantMessage(error instanceof Error ? error.message : "删除 Gallery 内容失败");
    } finally {
      setBusyGalleryAction(null);
    }
  }

  return (
    <section className="page overview-gallery-page">
      <header className="page-header overview-gallery-header">
        <div>
          <span className="eyebrow">项目总览</span>
          <h1>项目 Gallery</h1>
          <p>已确认的人物、场景、风格参考图和生成视频会按用途归档；历史候选图默认折叠，减少首屏缩略图加载。</p>
        </div>
        <button type="button" className="primary-button" onClick={() => onNavigate("flow")}>
          <Film size={18} />
          进入视频 Flow Map
        </button>
      </header>

      <section className="gallery-project-index" aria-label="项目素材分类">
        <header className="gallery-section-header">
          <div>
            <span className="gallery-section-kicker">
              <FolderOpen size={16} />
              Project Index
            </span>
            <h2>按项目分类保存</h2>
            <p>每个项目的已确认人物、场景、Image Prompt 和视频素材都保留在自己的项目下。</p>
          </div>
          <span className="gallery-section-count">{galleryGroups.length}</span>
        </header>
        <div className="gallery-project-grid">
          {galleryGroups.map((group) => {
            const imageCount = group.totalAssets - group.sections.videos.length;
            return (
              <button
                type="button"
                className={`gallery-project-card${group.isActive ? " active" : ""}`}
                key={group.project.id}
                onClick={() => {
                  if (!group.isActive) onSelectProject?.(group.project.id);
                }}
                disabled={group.isActive || !onSelectProject}
              >
                <span>{group.isActive ? "当前项目" : "已保存项目"}</span>
                <strong>{group.project.title || group.project.storyState.world.title || "未命名项目"}</strong>
                <small>
                  {imageCount} 张图 · {group.sections.videos.length} 个视频 · {formatProjectDate(group.project.updatedAt)}
                </small>
              </button>
            );
          })}
        </div>
      </section>

      {totalAssets > 0 ? (
        <>
          <GalleryImageSection
            title="人物图片"
            description="已确认的人物模型图会进入这里。"
            items={gallery.characterImages}
            icon={<UserRound size={18} />}
            emptyCopy="还没有已确认人物图片"
            getDownloadHref={getDownloadHref}
            getPreviewHref={getPreviewHref}
            onAddToFlowMap={addGalleryImageToFlowMap}
            isActionBusy={isGalleryActionBusy}
            isAlreadyWorkflowModel={isAlreadyWorkflowModel}
            onDeleteAsset={deleteGalleryAsset}
            isDeleteBusy={isDeleteBusy}
          />
          <GalleryImageSection
            title="场景图片"
            description="已确认的场景模型图会进入这里。"
            items={gallery.sceneImages}
            icon={<MapPinned size={18} />}
            emptyCopy="还没有已确认场景图片"
            getDownloadHref={getDownloadHref}
            getPreviewHref={getPreviewHref}
            onAddToFlowMap={addGalleryImageToFlowMap}
            isActionBusy={isGalleryActionBusy}
            isAlreadyWorkflowModel={isAlreadyWorkflowModel}
            onDeleteAsset={deleteGalleryAsset}
            isDeleteBusy={isDeleteBusy}
          />
          <GalleryImageSection
            title="风格参考图片"
            description="Flow Map 中已确认的 Image Prompt 风格图会进入这里。"
            items={gallery.styleImages}
            icon={<Palette size={18} />}
            emptyCopy="还没有已确认风格参考图"
            getDownloadHref={getDownloadHref}
            getPreviewHref={getPreviewHref}
            onAddToFlowMap={addGalleryImageToFlowMap}
            isActionBusy={isGalleryActionBusy}
            isAlreadyWorkflowModel={isAlreadyWorkflowModel}
            onDeleteAsset={deleteGalleryAsset}
            isDeleteBusy={isDeleteBusy}
          />
          {gallery.historyImages.length > 0 ? (
            <GalleryImageSection
              title="历史候选图"
              description="未选中的人物、场景和风格候选图会按来源保留在这里，默认只加载最近一批。"
              items={gallery.historyImages}
              icon={<Archive size={18} />}
              emptyCopy="还没有历史候选图"
              getDownloadHref={getDownloadHref}
              getPreviewHref={getPreviewHref}
              onAddToFlowMap={addGalleryImageToFlowMap}
              isActionBusy={isGalleryActionBusy}
              isAlreadyWorkflowModel={isAlreadyWorkflowModel}
              onDeleteAsset={deleteGalleryAsset}
              isDeleteBusy={isDeleteBusy}
              initialLimit={historyPreviewLimit}
            />
          ) : null}
          {gallery.archivedCharacterImages.length > 0 ? (
            <GalleryImageSection
              title="历史人物图片"
              description="旧版本或已被替换的人物图会按提示词自动归到这里，默认只加载最近一批。"
              items={gallery.archivedCharacterImages}
              icon={<UserRound size={18} />}
              emptyCopy="还没有历史人物图片"
              getDownloadHref={getDownloadHref}
              getPreviewHref={getPreviewHref}
              onAddToFlowMap={addGalleryImageToFlowMap}
              isActionBusy={isGalleryActionBusy}
              isAlreadyWorkflowModel={isAlreadyWorkflowModel}
              onDeleteAsset={deleteGalleryAsset}
              isDeleteBusy={isDeleteBusy}
              initialLimit={historyPreviewLimit}
            />
          ) : null}
          {gallery.archivedSceneImages.length > 0 ? (
            <GalleryImageSection
              title="历史场景图片"
              description="旧版本或已被替换的场景、背景、车内外空间图会归到这里，默认只加载最近一批。"
              items={gallery.archivedSceneImages}
              icon={<MapPinned size={18} />}
              emptyCopy="还没有历史场景图片"
              getDownloadHref={getDownloadHref}
              getPreviewHref={getPreviewHref}
              onAddToFlowMap={addGalleryImageToFlowMap}
              isActionBusy={isGalleryActionBusy}
              isAlreadyWorkflowModel={isAlreadyWorkflowModel}
              onDeleteAsset={deleteGalleryAsset}
              isDeleteBusy={isDeleteBusy}
              initialLimit={historyPreviewLimit}
            />
          ) : null}
          {gallery.archivedStyleImages.length > 0 ? (
            <GalleryImageSection
              title="历史风格图片"
              description="旧版本的 Image Prompt、分镜、镜头和视觉风格参考图会归到这里，默认只加载最近一批。"
              items={gallery.archivedStyleImages}
              icon={<Palette size={18} />}
              emptyCopy="还没有历史风格图片"
              getDownloadHref={getDownloadHref}
              getPreviewHref={getPreviewHref}
              onAddToFlowMap={addGalleryImageToFlowMap}
              isActionBusy={isGalleryActionBusy}
              isAlreadyWorkflowModel={isAlreadyWorkflowModel}
              onDeleteAsset={deleteGalleryAsset}
              isDeleteBusy={isDeleteBusy}
              initialLimit={historyPreviewLimit}
            />
          ) : null}
          {gallery.uncategorizedImages.length > 0 ? (
            <GalleryImageSection
              title="未识别图片"
              description="无法从提示词判断用途的旧图片会暂存在这里，方便后续检查。"
              items={gallery.uncategorizedImages}
              icon={<ImageIcon size={18} />}
              emptyCopy="还没有未识别图片"
              getDownloadHref={getDownloadHref}
              getPreviewHref={getPreviewHref}
              onAddToFlowMap={addGalleryImageToFlowMap}
              isActionBusy={isGalleryActionBusy}
              isAlreadyWorkflowModel={isAlreadyWorkflowModel}
              onDeleteAsset={deleteGalleryAsset}
              isDeleteBusy={isDeleteBusy}
              initialLimit={historyPreviewLimit}
            />
          ) : null}
          <section className="gallery-section">
            <header className="gallery-section-header">
              <div>
                <span className="gallery-section-kicker">Generated Video</span>
                <h2>已生成视频</h2>
                <p>Flow Map 中完成生成并回填的 15 秒视频片段。</p>
              </div>
              <span className="gallery-section-count">{generatedVideos.length}</span>
            </header>
            {generatedVideos.length > 0 ? (
              <div className="video-gallery-grid">
                {generatedVideos.map(({ flow, index, asset, shot }) => (
                  <article className="video-gallery-card" key={flow.id}>
                    <button type="button" className="video-gallery-thumb" onClick={() => setPreviewFlowId(flow.id)}>
                      <video src={getPreviewHref(asset.id, asset.url)} muted playsInline preload="metadata" />
                      <span className="video-gallery-play">
                        <Play size={16} fill="currentColor" />
                      </span>
                    </button>
                    <div className="video-gallery-meta compact">
                      <div>
                        <span className="video-gallery-kicker">第{index + 1}段 15s 视频</span>
                        <h3>{shot?.shotType || "已生成片段"}</h3>
                      </div>
                      <span className="video-gallery-status">ready</span>
                    </div>
                    <div className="video-gallery-facts">
                      <span>{flow.aspectRatio}</span>
                      <span>{asset.provider === "seedance" ? "Seedance 2.0" : asset.provider || "Mock"}</span>
                    </div>
                    <div className="gallery-card-actions">
                      <a className="gallery-card-download" href={getDownloadHref(asset.id, asset.url)}>
                        <Download size={14} />
                        下载
                      </a>
                      <button
                        type="button"
                        className="gallery-card-action gallery-card-delete"
                        disabled={isDeleteBusy(asset.id)}
                        onClick={() => void deleteGalleryAsset(asset.id, shot?.shotType || `第${index + 1}段视频`)}
                      >
                        <Trash2 size={13} />
                        {isDeleteBusy(asset.id) ? "删除中" : "删除"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="gallery-empty-state">
                <Film size={26} />
                <span>还没有已生成视频</span>
              </div>
            )}
          </section>
        </>
      ) : (
        <article className="content-card overview-video-empty">
          <Film size={36} />
          <h2>Gallery 暂时为空</h2>
          <p>确认人物图、确认场景图或完成视频生成后，资产会自动出现在这里。</p>
          <button type="button" className="primary-button" onClick={() => onNavigate("flow")}>
            进入视频 Flow Map
            <ArrowRight size={16} />
          </button>
        </article>
      )}

      {selectedVideo ? (
        <div className="workflow-video-dialog-backdrop" onClick={() => setPreviewFlowId(null)}>
          <section
            className="workflow-video-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="overview-video-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">Gallery 视频预览</span>
                <h2 id="overview-video-dialog-title">第{selectedVideo.index + 1}段 15s 视频</h2>
                <p>{selectedVideo.shot?.shotType || "已生成片段"}</p>
              </div>
              <button
                type="button"
                className="workflow-dialog-close"
                onClick={() => setPreviewFlowId(null)}
                aria-label="关闭视频预览弹窗"
              >
                <X size={18} />
              </button>
            </header>
            <div className="workflow-video-dialog-body">
              <video src={getPreviewHref(selectedVideo.asset.id, selectedVideo.asset.url)} controls playsInline preload="metadata" />
              <div className="workflow-video-dialog-actions">
                <span>
                  {selectedVideo.asset.provider === "seedance" ? "Seedance 2.0" : selectedVideo.asset.provider} ·{" "}
                  {selectedVideo.asset.createdAt ? new Date(selectedVideo.asset.createdAt).toLocaleString() : "已生成"}
                </span>
                <a className="secondary-button" href={apiClient.assetDownloadUrl(project.id, selectedVideo.asset.id)}>
                  <Download size={16} />
                  存到本地
                </a>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

type GalleryImageSectionProps = {
  title: string;
  description: string;
  items: GalleryImageItem[];
  icon: ReactNode;
  emptyCopy: string;
  getDownloadHref: (assetId: string, url: string) => string;
  getPreviewHref: (assetId: string, url: string) => string;
  onAddToFlowMap: (item: GalleryImageItem, kind: WorkflowModelKind) => void | Promise<void>;
  isActionBusy: (item: GalleryImageItem, kind: WorkflowModelKind) => boolean;
  isAlreadyWorkflowModel: (item: GalleryImageItem, kind: WorkflowModelKind) => boolean;
  onDeleteAsset: (assetId: string, title: string) => void | Promise<void>;
  isDeleteBusy: (assetId: string) => boolean;
  initialLimit?: number;
};

function getGalleryActionKey(item: GalleryImageItem, kind: WorkflowModelKind): string {
  return `${kind}:${item.asset.id}`;
}

function getGalleryDeleteKey(assetId: string): string {
  return `delete:${assetId}`;
}

function formatProjectDate(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "未知更新时间";
  return new Date(time).toLocaleString();
}

function GalleryImageSection({
  title,
  description,
  items,
  icon,
  emptyCopy,
  getDownloadHref,
  getPreviewHref,
  onAddToFlowMap,
  isActionBusy,
  isAlreadyWorkflowModel,
  onDeleteAsset,
  isDeleteBusy,
  initialLimit
}: GalleryImageSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const limit = initialLimit && !expanded ? initialLimit : items.length;
  const visibleItems = items.slice(0, limit);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);

  return (
    <section className="gallery-section">
      <header className="gallery-section-header">
        <div>
          <span className="gallery-section-kicker">{icon} Asset Collection</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="gallery-section-count">{items.length}</span>
      </header>
      {items.length > 0 ? (
        <>
          <div className="asset-gallery-grid">
            {visibleItems.map((item, index) => {
              const previewHref = getPreviewHref(item.asset.id, item.asset.url);
              return (
                <article className="asset-gallery-card" key={item.id}>
                  <a className="asset-gallery-thumb" href={previewHref} target="_blank" rel="noreferrer">
                    <img
                      src={previewHref}
                      alt={item.title}
                      loading="lazy"
                      decoding="async"
                      data-gallery-index={index}
                    />
                  </a>
                  <div className="asset-gallery-meta">
                    <div>
                      <span>{item.subtitle}</span>
                      <h3>{item.title}</h3>
                    </div>
                  </div>
                  <div className="gallery-card-actions">
                    <button
                      type="button"
                      className="gallery-card-action"
                      disabled={isAlreadyWorkflowModel(item, "character") || isActionBusy(item, "character")}
                      onClick={() => void onAddToFlowMap(item, "character")}
                    >
                      <UserRound size={13} />
                      {isAlreadyWorkflowModel(item, "character") ? "已是人物" : isActionBusy(item, "character") ? "加入中" : "加入人物"}
                    </button>
                    <button
                      type="button"
                      className="gallery-card-action"
                      disabled={isAlreadyWorkflowModel(item, "scene") || isActionBusy(item, "scene")}
                      onClick={() => void onAddToFlowMap(item, "scene")}
                    >
                      <MapPinned size={13} />
                      {isAlreadyWorkflowModel(item, "scene") ? "已是场景" : isActionBusy(item, "scene") ? "加入中" : "加入场景"}
                    </button>
                    <a className="gallery-card-download" href={getDownloadHref(item.asset.id, item.asset.url)}>
                      <Download size={14} />
                      下载
                    </a>
                    <button
                      type="button"
                      className="gallery-card-action gallery-card-delete"
                      disabled={isDeleteBusy(item.asset.id)}
                      onClick={() => void onDeleteAsset(item.asset.id, item.title)}
                    >
                      <Trash2 size={13} />
                      {isDeleteBusy(item.asset.id) ? "删除中" : "删除"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          {initialLimit && items.length > initialLimit ? (
            <button type="button" className="gallery-section-toggle" onClick={() => setExpanded((current) => !current)}>
              {expanded ? "收起历史图片" : `显示剩余 ${hiddenCount} 张`}
            </button>
          ) : null}
        </>
      ) : (
        <div className="gallery-empty-state">
          <ImageIcon size={26} />
          <span>{emptyCopy}</span>
        </div>
      )}
    </section>
  );
}
