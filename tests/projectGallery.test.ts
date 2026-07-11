import { describe, expect, it } from "vitest";
import { createDemoProject } from "../src/data/demoProject";
import { getProjectGalleryGroups, getProjectGallerySections } from "../src/lib/projectGallery";
import type { MediaAsset } from "../src/types/domain";

function imageAsset(id: string, url = `/media/${id}.png`, prompt = `prompt ${id}`): MediaAsset {
  return {
    id,
    type: "image",
    url,
    provider: "mock",
    prompt,
    createdAt: "2026-05-16T00:00:00.000Z"
  };
}

function videoAsset(id: string, url = `/media/${id}.mp4`): MediaAsset {
  return {
    id,
    type: "video",
    url,
    provider: "mock",
    prompt: `prompt ${id}`,
    createdAt: "2026-05-16T00:00:00.000Z"
  };
}

describe("project gallery sections", () => {
  it("categorizes confirmed character images, confirmed scene images, and generated videos", () => {
    const project = createDemoProject();
    const confirmedCharacter = imageAsset("asset-character-confirmed");
    const unconfirmedCharacter = imageAsset("asset-character-unconfirmed");
    const confirmedScene = imageAsset("asset-scene-confirmed");
    const styleReference = imageAsset("asset-style-reference");
    const generatedVideo = videoAsset("asset-video-ready");

    project.assets = [confirmedCharacter, unconfirmedCharacter, confirmedScene, styleReference, generatedVideo];
    project.characterModels[0].candidateImages = [confirmedCharacter, unconfirmedCharacter];
    project.characterModels[0].confirmedImageId = confirmedCharacter.id;
    project.sceneModels[0].candidateImages = [confirmedScene];
    project.sceneModels[0].confirmedImageId = confirmedScene.id;
    project.videoFlows[0].nodes.promptNode.candidateImages = [styleReference];
    project.videoFlows[0].nodes.promptNode.confirmedImageId = styleReference.id;
    project.videoFlows[0].videoAssetId = generatedVideo.id;
    project.videoFlows[0].status = "ready";

    const sections = getProjectGallerySections(project);

    expect(sections.characterImages.map((item) => item.asset.id)).toEqual([confirmedCharacter.id]);
    expect(sections.sceneImages.map((item) => item.asset.id)).toEqual([confirmedScene.id]);
    expect(sections.styleImages.map((item) => item.asset.id)).toEqual([styleReference.id]);
    expect(sections.historyImages.map((item) => item.asset.id)).toEqual([unconfirmedCharacter.id]);
    expect(sections.archivedCharacterImages).toEqual([]);
    expect(sections.archivedSceneImages).toEqual([]);
    expect(sections.archivedStyleImages).toEqual([]);
    expect(sections.uncategorizedImages).toEqual([]);
    expect(sections.videos.map((item) => item.asset.id)).toEqual([generatedVideo.id]);
  });

  it("uses confirmed candidate images when project assets are missing the image", () => {
    const project = createDemoProject();
    const confirmedCharacter = imageAsset("asset-character-candidate-only");
    const confirmedScene = imageAsset("asset-scene-candidate-only");

    project.assets = [];
    project.characterModels[0].candidateImages = [confirmedCharacter];
    project.characterModels[0].confirmedImageId = confirmedCharacter.id;
    project.sceneModels[0].candidateImages = [confirmedScene];
    project.sceneModels[0].confirmedImageId = confirmedScene.id;

    const sections = getProjectGallerySections(project);

    expect(sections.characterImages[0]?.asset.url).toBe(confirmedCharacter.url);
    expect(sections.sceneImages[0]?.asset.url).toBe(confirmedScene.url);
  });

  it("splits leftover stored images by prompt semantics", () => {
    const project = createDemoProject();
    const archivedCharacter = imageAsset(
      "asset-archived-character",
      "/media/asset-archived-character.png",
      "角色 1：陈策 定位：主角/观察者，男，25岁，主角本人"
    );
    const archivedScene = imageAsset(
      "asset-archived-scene",
      "/media/asset-archived-scene.png",
      "后门旁一排附近，发现自己坐在午夜行驶的客车上，前方有两道模糊身影，空间结构图"
    );
    const archivedStyle = imageAsset(
      "asset-archived-style",
      "/media/asset-archived-style.png",
      "Image Prompt 风格参考图，半写实国漫镜头"
    );

    project.assets = [archivedCharacter, archivedScene, archivedStyle];
    project.characterModels = [];
    project.sceneModels = [];
    project.videoFlows = [];

    const sections = getProjectGallerySections(project);

    expect(sections.archivedCharacterImages.map((item) => item.asset.id)).toEqual([archivedCharacter.id]);
    expect(sections.archivedSceneImages.map((item) => item.asset.id)).toEqual([archivedScene.id]);
    expect(sections.archivedStyleImages.map((item) => item.asset.id)).toEqual([archivedStyle.id]);
    expect(sections.uncategorizedImages).toEqual([]);
  });

  it("recognizes old English character prompts as archived character images", () => {
    const project = createDemoProject();
    const heroine = imageAsset(
      "asset-english-heroine",
      "/media/asset-english-heroine.png",
      "silver short hair, translucent raincoat, blue interface mark behind ear, cyberpunk heroine, calm guarded expression"
    );
    const maleLead = imageAsset(
      "asset-english-male-lead",
      "/media/asset-english-male-lead.png",
      "black hair, long dark coat, black umbrella, subtle mechanical iris glow, cyberpunk male lead, restrained"
    );

    project.assets = [heroine, maleLead];
    project.characterModels = [];
    project.sceneModels = [];
    project.videoFlows = [];

    const sections = getProjectGallerySections(project);

    expect(sections.archivedCharacterImages.map((item) => item.asset.id)).toEqual([heroine.id, maleLead.id]);
    expect(sections.uncategorizedImages).toEqual([]);
  });

  it("keeps uncategorized stored images visible in the gallery", () => {
    const project = createDemoProject();
    const storedImage = imageAsset("asset-stored-image");

    project.assets = [storedImage];
    project.characterModels = [];
    project.sceneModels = [];
    project.videoFlows = [];

    const sections = getProjectGallerySections(project);

    expect(sections.uncategorizedImages.map((item) => item.asset.id)).toEqual([storedImage.id]);
  });

  it("keeps current image prompt candidates in history instead of uncategorized images", () => {
    const project = createDemoProject();
    const promptCandidate = imageAsset("asset-prompt-candidate");

    project.assets = [promptCandidate];
    project.videoFlows[0].nodes.promptNode.candidateImages = [promptCandidate];
    project.videoFlows[0].nodes.promptNode.confirmedImageId = undefined;

    const sections = getProjectGallerySections(project);

    expect(sections.historyImages.map((item) => item.asset.id)).toEqual([promptCandidate.id]);
    expect(sections.historyImages[0]?.subtitle).toBe("风格候选图");
    expect(sections.archivedStyleImages).toEqual([]);
    expect(sections.uncategorizedImages).toEqual([]);
  });

  it("groups gallery assets by project without mixing projects", () => {
    const firstProject = createDemoProject({ id: "project-first", title: "旧项目" });
    const secondProject = createDemoProject({ id: "project-second", title: "新项目" });
    const firstImage = imageAsset("asset-first-character");
    const secondVideo = videoAsset("asset-second-video");

    firstProject.assets = [firstImage];
    firstProject.characterModels[0].candidateImages = [firstImage];
    firstProject.characterModels[0].confirmedImageId = firstImage.id;
    secondProject.assets = [secondVideo];
    secondProject.videoFlows[0].videoAssetId = secondVideo.id;

    const groups = getProjectGalleryGroups([secondProject, firstProject], "project-second");

    expect(groups.map((group) => group.project.id)).toEqual(["project-second", "project-first"]);
    expect(groups[0].isActive).toBe(true);
    expect(groups[0].totalAssets).toBe(1);
    expect(groups[0].sections.videos.map((item) => item.asset.id)).toEqual([secondVideo.id]);
    expect(groups[0].sections.characterImages).toEqual([]);
    expect(groups[1].isActive).toBe(false);
    expect(groups[1].totalAssets).toBe(1);
    expect(groups[1].sections.characterImages.map((item) => item.asset.id)).toEqual([firstImage.id]);
    expect(groups[1].sections.videos).toEqual([]);
  });
});
