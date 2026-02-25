import { apiFetch } from "./api";

type SendMediaParams = {
  sessionKey: string;
  to: string;
  caption?: string;
};

// Fungsi ini dipanggil oleh Inbox.tsx
export async function sendMedia(
  kind: "image" | "video" | "document",
  params: SendMediaParams,
  file: File
) {
  const formData = new FormData();
  formData.append("sessionKey", params.sessionKey);
  formData.append("to", params.to);
  formData.append("kind", kind);
  if (params.caption) {
    formData.append("caption", params.caption);
  }
  formData.append("file", file);

  // apiFetch di 'api.ts' sudah diatur untuk tidak menimpa Content-Type 
  // jika body adalah FormData (biarkan browser set boundary multipart)
  return await apiFetch("/messages/send-media", {
    method: "POST",
    body: formData,
  });
}