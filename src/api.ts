// Thin typed wrapper over the FastAPI backend. Vite proxies /api -> http://127.0.0.1:8000.

const BASE = import.meta.env.VITE_API_BASE_URL || "/api";
const TOKEN_KEY = "aeos.token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string | null) =>
  token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Nothing should ever hang the UI forever. Voice calls get a much larger budget
// because the first one downloads and loads the speaker model.
const DEFAULT_TIMEOUT_MS = 60_000;
const VOICE_TIMEOUT_MS = 300_000;

async function request<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  // Required for ngrok to skip browser warning page
  headers.set("ngrok-skip-browser-warning", "true");

  let response: Response;
  try {
    response = await fetch(BASE + path, {
      ...init,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new ApiError(
        0,
        `The server did not answer within ${Math.round(timeoutMs / 1000)}s. ` +
          "The first voice request downloads the speaker model — check the server log.",
      );
    }
    // A dead Vite dev server looks identical to a dead backend from here, so name both.
    throw new ApiError(
      0,
      "Cannot reach the API. Check that FastAPI is running on port 8000 and that this " +
        "page is served by `npm run dev` (the proxy lives in the dev server).",
    );
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    // FastAPI puts a string in `detail` for HTTPException and a list for validation errors.
    const detail = payload?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d.msg).join("; ")
          : `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }
  return payload as T;
}

const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
const form = (data: FormData): RequestInit => ({ method: "POST", body: data });

// ------------------------------------------------------------------------ types

export type TutorLevel = "beginner" | "intermediate" | "advanced" | "senior";
export type InterviewLevel =
  | "fundamentals" | "intermediate" | "advanced" | "senior" | "system_design" | "production";

export type User = {
  username: string;
  display_name: string;
  level: string;
  voice_enrolled: boolean;
  created_at: string;
};

export type Session = { token: string; method: string; score?: number; user: User };

export type Turn = {
  role: "user" | "assistant";
  content: string;
  ts: string;
  intent?: string;
  level?: string;
};

export type NewsItem = {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  published_at: string;
  importance: number;
  kind?: "live" | "seed";
};

export type NewsFeed = {
  live: boolean;
  fetched_at: string | null;
  live_count: number;
  seeded_count: number;
  sources: string[];
  fetch_errors: string[];
  note: string | null;
  items: NewsItem[];
};

export type Topic = { id: string; name: string; description: string };

export type TopicCatalogue = {
  topics: Topic[];
  levels: InterviewLevel[];
  stages: string[];
  actions: InterviewAction[];
};

export type InterviewAction =
  | "hint" | "harder" | "easier" | "follow_up" | "repeat" | "skip" | "back" | "end";

export type InterviewView = {
  session_id: string;
  topic: string;
  level: InterviewLevel;
  stage: string;
  stage_number: number;
  stage_total: number;
  question: string;
  question_source: string;
  asked_count: number;
  // Present after an answer or an action.
  hint?: string;
  score?: number;
  verdict?: string;
  feedback?: string;
  missing?: string[];
  model_answer?: string;
  advanced?: boolean;
};

export type InterviewSummary = {
  action: "end";
  summary: {
    topic: string;
    level: string;
    answered: number;
    average_score: number | null;
    stages_reached: string;
    history: { question: string; stage: string; answer: string; score: number }[];
  };
};

export type VoiceReply = {
  heard: string;
  action: string;
  speak: string;
  result: Record<string, unknown>;
  /** The rest of a multi-part command, to re-send once the new screen has loaded. */
  remainder?: string | null;
};


// ------------------------------------------------------------------- profile

/** A scalar profile field plus where it came from. `edited` locks it against imports. */
export type Field = { value: string | null; source: string | null; edited: boolean };

export type ProfileItem = {
  id?: string;
  source?: string;
  edited?: boolean;
  evidence?: string[];
  [key: string]: unknown;
};

export type Insight = { name: string; level: "strong" | "emerging"; evidence: string[] };

export type AiInsights = {
  areas: Insight[];
  patterns: { pattern: string; evidence: string[] }[];
  recommended: { area: string; why: string }[];
  generated_at?: string;
};

export type EngineeringDna = {
  technical_strengths: string[];
  systems_built: string[];
  engineering_patterns: string[];
  specializations: string[];
  next_focus: string[];
};

export type SourceRecord = {
  id: string;
  source_type: "resume" | "portfolio" | "past_work";
  source_name: string;
  source_url: string | null;
  extracted_at: string;
  chars: number;
};

export type PersonalProfile = {
  basic: { name: Field; headline: Field; location: Field; email: Field };
  bio: { full: Field; short: Field; interview: Field };
  skills: ProfileItem[];
  experience: ProfileItem[];
  education: ProfileItem[];
  certifications: ProfileItem[];
  achievements: ProfileItem[];
  projects: ProfileItem[];
  links: ProfileItem[];
  engineering_dna: EngineeringDna | null;
  ai_insights: AiInsights | null;
  career_narrative: Field;
  sources: SourceRecord[];
  updated_at: string | null;
};

export type Completeness = {
  percent: number;
  filled: number;
  total: number;
  missing: string[];
};

export type ProfileResponse = { profile: PersonalProfile; completeness: Completeness };

export type SyncChange = {
  kind: "new" | "updated";
  section: string;
  label: string;
  item: Record<string, unknown>;
  current?: Record<string, unknown>;
};

export type PastWorkUpload = { file: File; title?: string; category?: string };

// ------------------------------------------------------------------ research

export type ResearchSource = {
  id: string;
  url: string;
  title: string;
  type: string;
  origin: string;
  status: "ok" | "failed" | "blocked";
  chars: number;
  fetched_at: string;
  error: string | null;
  identity_confidence: Confidence;
  identity_signals: string[];
};

export type Evidence = {
  url: string;
  title: string;
  source_type: string;
  identity_confidence: string;
  snippet: string;
};

export type TimelineStep = { at: string; stage: string; detail: string; url: string | null };

export type ResearchSummary = {
  sources_researched: number;
  relevant_sources: number;
  blocked_sources: number;
  failed_sources: number;
  projects_discovered: number;
  skills_discovered: number;
  high_confidence_findings: number;
  needs_review: number;
};

export type Confidence = "high" | "medium" | "low" | "unrelated";

export type Finding = {
  id: string;
  section: string;
  label: string;
  claim: string;
  item: Record<string, unknown>;
  source_urls: string[];
  source_title: string;
  source_type: string;
  identity_confidence: Confidence;
  fact_confidence: Confidence;
  evidence: Evidence[];
  discovered_at: string;
  status: "pending" | "approved" | "ignored" | "changed";
};

export type Conflict = {
  field: string;
  values: { value: string; source: string; type: string }[];
  note: string;
};

export type IdentityWarning = { kind: string; message: string; source: string };

export type WebView = {
  focus: string;
  strengths: string[];
  projects: string[];
  footprint: string[];
  notable: string[];
};

export type ResearchDna = {
  technical_themes: string[];
  engineering_patterns: string[];
  specializations: string[];
  emerging: string[];
  recommended: string[];
};

export type ResearchSession = {
  identity?: { name?: string; portfolio?: string; github?: string; other?: string };
  depth?: string;
  search_provider?: string;
  search_available?: boolean;
  queries?: string[];
  discoveries?: Record<string, string[]>;
  timeline?: TimelineStep[];
  summary?: ResearchSummary;
  sources?: ResearchSource[];
  findings?: Finding[];
  conflicts?: Conflict[];
  identity_warnings?: IdentityWarning[];
  insights?: WebView | null;
  engineering_dna?: ResearchDna | null;
  generated_bios?: Record<string, { text: string; generated_at: string }>;
  started_at?: string;
  completed_at?: string;
  previous_researched_at?: string | null;
  delta?: { new: number; changed: number };
};

// -------------------------------------------------------------------- agents

export type RegistryEntry = {
  name: string;
  description: string;
  permission?: string;
  available?: boolean;
};

export type AgentRegistries = {
  skills: RegistryEntry[];
  tools: RegistryEntry[];
  permissions: Record<string, string>;
};

export type AgentRun = {
  at: string;
  message: string;
  answer: string;
  tool_calls: { tool: string; args: Record<string, unknown>; ok: boolean }[];
  latency_ms: number;
};

export type AgentEvaluation = {
  agent_id: string;
  evaluated_at: string;
  runs_evaluated: number;
  metrics: Record<string, number | null>;
  judgement: Record<string, unknown>;
};

export type Agent = {
  agent_id: string;
  owner: string;
  request: string;
  status: "ready" | "disabled";
  validation_notes: string[];
  created_at: string;
  updated_at: string;
  name: string;
  description: string;
  role: string;
  goal: string;
  skills: string[];
  tools: string[];
  knowledge_sources: string[];
  memory_enabled: boolean;
  model: string;
  permissions: string[];
  safety_policy: Record<string, boolean>;
  evaluation_config: Record<string, boolean>;
  runs: AgentRun[];
  last_evaluation?: AgentEvaluation;
};

// ------------------------------------------------------------- observability

export type Bucket = {
  calls: number;
  failures: number;
  tokens: number;
  cost: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  failure_rate: number;
};

export type ObservabilitySummary = {
  window_days: number;
  totals: {
    calls: number;
    estimated_cost: number;
    total_tokens: number;
    avg_latency_ms: number;
    p95_latency_ms: number;
    success_rate: number;
    failure_rate: number;
    fallback_calls: number;
  };
  by_feature: Record<string, Bucket>;
  by_model: Record<string, Bucket>;
  slowest: { request_id: string; feature: string; model: string; latency_ms: number;
             timestamp: string; success: boolean }[];
  recent_errors: { request_id: string; feature: string; model: string;
                   error_type: string | null; timestamp: string }[];
};

export type RateLimits = {
  limits: Record<string, { max_calls: number; window_seconds: number }>;
  pricing_usd_per_million: Record<string, [number, number]>;
};

// --------------------------------------------------------------------- endpoints

export const api = {
  register: (body: {
    username: string;
    password: string;
    display_name?: string;
    level: TutorLevel;
  }) => request<User>("/auth/register", json(body)),

  loginWithPassword: (username: string, password: string) => {
    const data = new FormData();
    data.append("username", username);
    data.append("password", password);
    return request<Session>("/auth/voice/login", form(data));
  },

  loginWithVoice: (sample: Blob, username?: string) => {
    const data = new FormData();
    data.append("sample", sample, "login.wav");
    if (username) data.append("username", username);
    return request<Session>("/auth/voice/login", form(data), VOICE_TIMEOUT_MS);
  },

  enrollVoice: (username: string, password: string, samples: Blob[]) => {
    const data = new FormData();
    data.append("username", username);
    data.append("password", password);
    samples.forEach((s, i) => data.append("samples", s, `enroll-${i}.wav`));
    return request<{ samples_stored: number; note: string }>(
      "/auth/voice/enroll",
      form(data),
      VOICE_TIMEOUT_MS,
    );
  },

  me: () => request<User>("/auth/me"),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),

  chat: (message: string, level?: TutorLevel, code?: string) =>
    request<{ reply: string; intent: string; level: string; turns: number }>(
      "/ai/chat",
      json({ message, level, code: code || null }),
    ),

  history: (limit = 50) =>
    request<{ username: string; count: number; turns: Turn[] }>(`/ai/history?limit=${limit}`),

  news: (limit = 25, refresh = false) =>
    request<NewsFeed>(`/news?limit=${limit}&refresh=${refresh}`),

  explainNews: (news_id: string, level?: TutorLevel) =>
    request<{ item: NewsItem; explanation: string }>("/news/explain", json({ news_id, level })),

  topics: () => request<TopicCatalogue>("/interview/topics"),

  startInterview: (topic: string, level: InterviewLevel) =>
    request<InterviewView>("/interview/start", json({ topic, level })),

  answerInterview: (session_id: string, answer: string) =>
    request<InterviewView>("/interview/answer", json({ session_id, answer })),

  interviewAction: (session_id: string, action: InterviewAction) =>
    request<InterviewView | InterviewSummary>("/interview/action", json({ session_id, action })),


  // ----------------------------------------------------------------- profile

  getProfile: () => request<ProfileResponse>("/profile"),

  updateProfile: (patch: Record<string, unknown>) =>
    request<ProfileResponse>("/profile", { method: "PUT", body: JSON.stringify(patch) }),

  importResume: (file: File) => {
    const data = new FormData();
    data.append("file", file);
    return request<PersonalProfile>("/profile/import/resume", form(data), VOICE_TIMEOUT_MS);
  },

  importPastWork: (uploads: PastWorkUpload[]) => {
    const data = new FormData();
    uploads.forEach((u) => {
      data.append("files", u.file);
      data.append("titles", u.title || "");
      data.append("categories", u.category || "");
    });
    return request<PersonalProfile>("/profile/import/past-work", form(data), VOICE_TIMEOUT_MS);
  },

  importLink: (url: string) =>
    request<PersonalProfile>("/profile/import/link", json({ url }), VOICE_TIMEOUT_MS),

  importPortfolio: (url: string) =>
    request<PersonalProfile>("/profile/import/portfolio", json({ url }), VOICE_TIMEOUT_MS),

  buildProfile: () =>
    request<PersonalProfile>("/profile/build", { method: "POST" }, VOICE_TIMEOUT_MS),

  generateBio: (style: "full" | "short" | "interview" | "improve") =>
    request<{ style: string; slot: string; text: string }>(
      "/profile/generate-bio", json({ style }), VOICE_TIMEOUT_MS),

  generateNarrative: () =>
    request<{ text: string }>("/profile/generate-narrative", { method: "POST" }, VOICE_TIMEOUT_MS),

  analyzeProfile: () =>
    request<{ ai_insights: AiInsights; engineering_dna: EngineeringDna | null }>(
      "/profile/analyze", { method: "POST" }, VOICE_TIMEOUT_MS),

  askAboutMe: (question: string) =>
    request<{ question: string; answer: string }>("/profile/ask", json({ question }), VOICE_TIMEOUT_MS),

  syncPortfolio: () =>
    request<{ url: string; changes: SyncChange[]; checked_at: string }>(
      "/profile/sync-portfolio", { method: "POST" }, VOICE_TIMEOUT_MS),

  applySync: (changes: SyncChange[]) =>
    request<PersonalProfile>("/profile/sync-portfolio/apply", json({ changes })),

  // ---------------------------------------------------------------- research

  runResearch: (body: {
    name?: string; portfolio?: string; github?: string; other?: string; deep?: boolean;
  }) => request<ResearchSession>("/research/run", json(body), VOICE_TIMEOUT_MS),

  getResearch: () => request<ResearchSession>("/research"),

  approveFinding: (id: string) =>
    request<{ finding: Finding; section: string }>(
      `/research/findings/${encodeURIComponent(id)}/approve`, { method: "POST" }),

  ignoreFinding: (id: string) =>
    request<{ finding: Finding }>(
      `/research/findings/${encodeURIComponent(id)}/ignore`, { method: "POST" }),

  researchBio: (style: "short" | "professional" | "interview" | "technical") =>
    request<{ style: string; text: string }>(
      "/research/generate-bio", json({ style }), VOICE_TIMEOUT_MS),

  // ------------------------------------------------------------------ agents

  agentRegistry: () => request<AgentRegistries>("/agents/registry"),

  createAgent: (req: string) =>
    request<Agent>("/agents/create", json({ request: req }), VOICE_TIMEOUT_MS),

  listAgents: () => request<{ agents: Agent[] }>("/agents"),

  getAgent: (id: string) => request<Agent>(`/agents/${encodeURIComponent(id)}`),

  runAgent: (id: string, message: string) =>
    request<AgentRun & { agent_id: string; name: string }>(
      `/agents/${encodeURIComponent(id)}/run`, json({ message }), VOICE_TIMEOUT_MS),

  evaluateAgent: (id: string) =>
    request<AgentEvaluation>(
      `/agents/${encodeURIComponent(id)}/evaluate`, { method: "POST" }, VOICE_TIMEOUT_MS),

  patchAgent: (id: string, patch: Record<string, unknown>) =>
    request<Agent>(`/agents/${encodeURIComponent(id)}`, {
      method: "PATCH", body: JSON.stringify(patch),
    }),

  deleteAgent: (id: string) =>
    request<{ deleted: string }>(`/agents/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // ----------------------------------------------------------- observability

  observabilitySummary: (days = 1) =>
    request<ObservabilitySummary>(`/observability/summary?days=${days}`),

  observabilityLimits: () => request<RateLimits>("/observability/limits"),

  voiceCommand: (input: {
    text?: string;
    audio?: Blob;
    session_id?: string;
    news_id?: string;
    confirm?: boolean;
    targets?: unknown[];
  }) => {
    const data = new FormData();
    if (input.text) data.append("text", input.text);
    if (input.confirm) data.append("confirm", "true");
    if (input.targets?.length) data.append("targets", JSON.stringify(input.targets));
    if (input.audio) data.append("audio", input.audio, "command.wav");
    if (input.session_id) data.append("session_id", input.session_id);
    if (input.news_id) data.append("news_id", input.news_id);
    return request<VoiceReply>("/voice/command", form(data), VOICE_TIMEOUT_MS);
  },
};

// -------------------------------------------------------------------- recording

/**
 * Record from the microphone and hand back a 16 kHz mono WAV.
 *
 * MediaRecorder gives webm/opus, which the Python side cannot reliably decode. The
 * browser already knows how to decode it, so we decode here and re-encode as plain PCM.
 */
export async function startRecording(): Promise<() => Promise<Blob>> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.start();

  return () =>
    new Promise<Blob>((resolve, reject) => {
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        try {
          const buffer = await new Blob(chunks).arrayBuffer();
          const ctx = new AudioContext();
          const decoded = await ctx.decodeAudioData(buffer);
          await ctx.close();
          resolve(encodeWav(downmixTo16k(decoded)));
        } catch (e) {
          reject(new Error(`Could not process the recording: ${(e as Error).message}`));
        }
      };
      recorder.stop();
    });
}

/** Average the channels to mono and resample to 16 kHz by linear interpolation. */
function downmixTo16k(buffer: AudioBuffer): Float32Array {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
    buffer.getChannelData(i),
  );
  const mono = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    let sum = 0;
    for (const channel of channels) sum += channel[i];
    mono[i] = sum / channels.length;
  }

  if (buffer.sampleRate === 16000) return mono;
  const ratio = buffer.sampleRate / 16000;
  const out = new Float32Array(Math.floor(mono.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const at = i * ratio;
    const low = Math.floor(at);
    const high = Math.min(low + 1, mono.length - 1);
    out[i] = mono[low] + (mono[high] - mono[low]) * (at - low);
  }
  return out;
}

/** Minimal 16-bit PCM WAV container. */
function encodeWav(samples: Float32Array, sampleRate = 16000): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) =>
    [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));

  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Browser TTS. Piper on the server is optional; this needs no setup.
 *
 * Resolves when speech finishes so hands-free mode can pause the microphone while the
 * assistant talks — otherwise it transcribes its own voice and answers itself.
 */
export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window) || !text) return resolve();
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text.slice(0, 600));
    utterance.rate = 1.05;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);

    // Chrome sometimes drops onend for long utterances; never hang the caller.
    setTimeout(resolve, 30_000);
  });
}

/** Cut the assistant off mid-sentence. Safe to call when nothing is speaking. */
export function stopSpeaking() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}
