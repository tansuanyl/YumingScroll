export const SOURCE_IMPORT_ACCEPT =
  ".txt,.md,.markdown,.csv,.json,.log,.docx,text/*,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const SOURCE_IMPORT_MAX_FILE_BYTES = 8 * 1024 * 1024;

export type SourceFilePayload = {
  fileName: string;
  mimeType?: string;
  base64: string;
};

export async function buildSourceFilePayload(file: File): Promise<SourceFilePayload> {
  return {
    fileName: file.name,
    mimeType: file.type,
    base64: await readFileAsBase64(file)
  };
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("文档读取失败，请重新选择文件。"));
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });
}
