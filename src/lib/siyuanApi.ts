import { fetchPost } from "siyuan";
import type { Notebook } from "./types";

interface KernelResponse<T> {
  code: number;
  msg: string;
  data: T;
}

export class SiYuanApiError extends Error {
  constructor(
    message: string,
    readonly endpoint: string,
    readonly code?: number
  ) {
    super(message);
    this.name = "SiYuanApiError";
  }
}

export class SiYuanApi {
  post<T>(endpoint: string, payload: Record<string, unknown> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      fetchPost(
        endpoint,
        payload,
        (response: KernelResponse<T>) => {
          if (response.code !== 0) {
            reject(new SiYuanApiError(response.msg || "SiYuan API request failed", endpoint, response.code));
            return;
          }
          resolve(response.data);
        },
        undefined,
        (response: KernelResponse<T>) => {
          reject(new SiYuanApiError(response?.msg || "SiYuan API request failed", endpoint, response?.code));
        }
      );
    });
  }

  async lsNotebooks(): Promise<Notebook[]> {
    const data = await this.post<unknown>("/api/notebook/lsNotebooks");
    const notebooks = readArray(data, "notebooks");
    return notebooks.map((item) => ({
      id: readString(item, "id"),
      name: readString(item, "name") || readString(item, "id"),
      closed: Boolean(readValue(item, "closed"))
    })).filter((notebook) => notebook.id && !notebook.closed);
  }

  async appendDailyNoteBlock(notebookId: string, markdown: string): Promise<string> {
    const data = await this.post<unknown>("/api/block/appendDailyNoteBlock", {
      notebook: notebookId,
      dataType: "markdown",
      data: markdown
    });
    return readBlockId(data);
  }

  async updateBlock(blockId: string, markdown: string): Promise<void> {
    await this.post<unknown>("/api/block/updateBlock", {
      id: blockId,
      dataType: "markdown",
      data: markdown
    });
  }

  async getBlockKramdown(blockId: string): Promise<string> {
    const data = await this.post<unknown>("/api/block/getBlockKramdown", { id: blockId });
    if (typeof data === "string") {
      return data;
    }
    if (isRecord(data)) {
      return readString(data, "kramdown") || readString(data, "markdown");
    }
    return "";
  }

  async blockExists(blockId: string): Promise<boolean> {
    if (!blockId) {
      return false;
    }
    try {
      await this.getBlockKramdown(blockId);
      return true;
    } catch {
      return false;
    }
  }

  async deleteBlock(blockId: string): Promise<void> {
    await this.post<unknown>("/api/block/deleteBlock", { id: blockId });
  }

  async setBlockAttrs(blockId: string, attrs: Record<string, string>): Promise<void> {
    await this.post<unknown>("/api/attr/setBlockAttrs", {
      id: blockId,
      attrs
    });
  }

  async uploadAsset(file: File): Promise<string> {
    const form = new FormData();
    form.append("assetsDirPath", "/assets/");
    form.append("file[]", file, file.name);

    const response = await fetch("/api/asset/upload", {
      method: "POST",
      body: form
    });
    const result = await response.json() as KernelResponse<unknown>;
    if (result.code !== 0) {
      throw new SiYuanApiError(result.msg || "Asset upload failed", "/api/asset/upload", result.code);
    }
    return readUploadedPath(result.data, file.name);
  }
}

function readUploadedPath(data: unknown, fileName: string): string {
  if (isRecord(data)) {
    const succMap = readValue(data, "succMap");
    if (isRecord(succMap)) {
      const first = Object.values(succMap).find((value) => typeof value === "string");
      if (typeof first === "string") {
        return first;
      }
    }
    const path = readString(data, "path") || readString(data, "destPath");
    if (path) {
      return path;
    }
  }
  return `/assets/${fileName}`;
}

function readBlockId(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  if (isRecord(data)) {
    const id = readString(data, "id") || readString(data, "blockID") || readString(data, "blockId");
    if (id) {
      return id;
    }
    const doOperations = readValue(data, "doOperations");
    const opId = readBlockIdFromOperations(doOperations);
    if (opId) {
      return opId;
    }
  }
  if (Array.isArray(data)) {
    const opId = readBlockIdFromOperations(data);
    if (opId) {
      return opId;
    }
  }
  return "";
}

function readBlockIdFromOperations(data: unknown): string {
  if (!Array.isArray(data)) {
    return "";
  }
  for (const item of data) {
    if (!isRecord(item)) {
      continue;
    }
    const id = readString(item, "id");
    if (id) {
      return id;
    }
    const nested = readBlockIdFromOperations(readValue(item, "doOperations"));
    if (nested) {
      return nested;
    }
  }
  return "";
}

function readArray(data: unknown, key: string): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (isRecord(data)) {
    const value = data[key];
    return Array.isArray(value) ? value : [];
  }
  return [];
}

function readString(data: unknown, key: string): string {
  const value = readValue(data, key);
  return typeof value === "string" ? value : "";
}

function readValue(data: unknown, key: string): unknown {
  return isRecord(data) ? data[key] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
