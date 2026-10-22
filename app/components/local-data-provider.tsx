"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { emptyLocalData, type LocalData } from "../lib/local-data";
import { createClient } from "../lib/supabase/client";

const STORAGE_KEY = "revenda-gestao.local-data.v1";

export type SyncStatus = "loading" | "saving" | "saved" | "error";

type LocalDataContextValue = {
  data: LocalData;
  ready: boolean;
  error: string | null;
  sync: SyncStatus;
  retrySync: () => void;
  replaceAll: (text: string) => void;
  update: (updater: (current: LocalData) => LocalData) => void;
};

const LocalDataContext = createContext<LocalDataContextValue | null>(null);

type LocalDataInput = Omit<LocalData, "incomingProducts"> & {
  incomingProducts?: LocalData["incomingProducts"];
};

function isLocalData(value: unknown): value is LocalDataInput {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    (record.incomingProducts === undefined || Array.isArray(record.incomingProducts)) &&
    [
      "products",
      "customers",
      "suppliers",
      "locations",
      "sales",
      "purchases",
      "units",
      "movements",
      "payments",
      "expenses",
      "refunds",
      "returns",
    ].every((key) => Array.isArray(record[key]))
  );
}

function parseLocalData(value: unknown): LocalData {
  if (!isLocalData(value)) {
    throw new Error("O formato dos dados locais não é reconhecido.");
  }
  return { ...value, incomingProducts: value.incomingProducts ?? [] };
}

export function LocalDataProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [data, setData] = useState<LocalData>(emptyLocalData);
  const dataRef = useRef(data);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncStatus>("loading");
  const ownerRef = useRef<string | null>(null);
  const remoteReadyRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const dirty = useRef(false);

  const flush = useCallback(async () => {
    if (!remoteReadyRef.current || !ownerRef.current) return;
    if (saving.current) {
      dirty.current = true;
      return;
    }
    saving.current = true;
    setSync("saving");
    let failed = false;
    do {
      dirty.current = false;
      const supabase = createClient();
      const { data: updated, error: updateError } = await supabase
        .from("app_state")
        .update({ data: dataRef.current })
        .eq("owner_id", ownerRef.current)
        .select("owner_id");
      let saveError = updateError;
      if (!saveError && (updated?.length ?? 0) === 0) {
        ({ error: saveError } = await supabase
          .from("app_state")
          .insert({ owner_id: ownerRef.current, data: dataRef.current }));
      }
      if (saveError) {
        console.error("Falha ao guardar app_state:", saveError.message);
        failed = true;
        break;
      }
    } while (dirty.current);
    saving.current = false;
    setSync(failed ? "error" : "saved");
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      let local: LocalData | null = null;
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) local = parseLocalData(JSON.parse(saved));
      } catch (cause) {
        setError(
          cause instanceof Error
            ? `Não foi possível carregar os dados locais: ${cause.message}`
            : "Não foi possível carregar os dados locais.",
        );
        setReady(true);
        return;
      }

      let chosen = local;
      let needsUpload = false;
      try {
        const supabase = createClient();
        const { data: userData, error: userError } =
          await supabase.auth.getUser();
        if (userError || !userData.user) throw userError ?? new Error("sem sessão");
        ownerRef.current = userData.user.id;
        const { data: row, error: rowError } = await supabase
          .from("app_state")
          .select("data")
          .eq("owner_id", userData.user.id)
          .maybeSingle();
        if (rowError) throw rowError;
        if (row) {
          chosen = parseLocalData(row.data);
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(chosen));
        } else {
          needsUpload = true;
        }
        remoteReadyRef.current = true;
      } catch {
        // Sem ligação à base de dados: continua com a cópia local, sem gravar online.
        if (active) setSync("error");
      }

      if (!active) return;
      if (chosen) {
        dataRef.current = chosen;
        setData(chosen);
      }
      setReady(true);
      if (remoteReadyRef.current) {
        if (needsUpload) void flush();
        else setSync("saved");
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [flush]);

  useEffect(() => {
    function syncFromOtherTab(event: StorageEvent) {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      try {
        if (event.newValue === null) {
          dataRef.current = emptyLocalData;
          setData(emptyLocalData);
          setError(null);
          return;
        }
        const parsed = parseLocalData(JSON.parse(event.newValue));
        dataRef.current = parsed;
        setData(parsed);
        setError(null);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? `Não foi possível sincronizar os dados locais: ${cause.message}`
            : "Não foi possível sincronizar os dados locais.",
        );
      }
    }
    window.addEventListener("storage", syncFromOtherTab);
    return () => window.removeEventListener("storage", syncFromOtherTab);
  }, []);

  const update = useCallback(
    (updater: (current: LocalData) => LocalData) => {
      if (!ready || error) {
        throw new Error(error ?? "Os dados locais ainda estão a carregar.");
      }
      const next = updater(dataRef.current);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      dataRef.current = next;
      setData(next);
      if (remoteReadyRef.current) {
        setSync("saving");
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => void flush(), 500);
      }
    },
    [error, flush, ready],
  );

  const retrySync = useCallback(() => {
    if (remoteReadyRef.current) void flush();
    else window.location.reload();
  }, [flush]);

  const replaceAll = useCallback(
    (text: string) => {
      if (!ready) throw new Error("Os dados ainda estão a carregar.");
      let parsed: LocalData;
      try {
        parsed = parseLocalData(JSON.parse(text));
      } catch {
        throw new Error("O ficheiro não é uma cópia de dados válida.");
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      dataRef.current = parsed;
      setData(parsed);
      setError(null);
      if (remoteReadyRef.current) {
        setSync("saving");
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => void flush(), 200);
      }
    },
    [flush, ready],
  );

  const value = useMemo(
    () => ({ data, ready, error, sync, retrySync, update, replaceAll }),
    [data, error, ready, replaceAll, retrySync, sync, update],
  );
  return (
    <LocalDataContext.Provider value={value}>
      {children}
    </LocalDataContext.Provider>
  );
}

export function useLocalData() {
  const context = useContext(LocalDataContext);
  if (!context) {
    throw new Error("useLocalData tem de ser usado dentro de LocalDataProvider.");
  }
  return context;
}
