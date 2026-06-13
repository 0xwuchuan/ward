import type { CodePreview, Finding, FindingPayload, Project } from "../types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    let detail = `Request failed with ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") {
        detail = body.detail;
      }
    } catch {
      detail = response.statusText || detail;
    }
    throw new Error(detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export function listProjects() {
  return request<Project[]>("/api/projects");
}

export function listFindings(
  projectId: string,
  filters: { search?: string; severity?: string; status?: string; source?: string; category?: string }
) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return request<Finding[]>(`/api/projects/${projectId}/findings${query ? `?${query}` : ""}`);
}

export function createFinding(projectId: string, payload: FindingPayload) {
  return request<Finding>(`/api/projects/${projectId}/findings`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateFinding(findingId: string, payload: Partial<FindingPayload>) {
  return request<Finding>(`/api/findings/${findingId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function getRelatedCode(findingId: string) {
  return request<CodePreview[]>(`/api/findings/${findingId}/related-code`);
}

export function deleteFinding(findingId: string) {
  return request<void>(`/api/findings/${findingId}`, { method: "DELETE" });
}
