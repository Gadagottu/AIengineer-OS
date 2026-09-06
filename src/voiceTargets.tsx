import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from "react";

/** One control the user can currently see and could therefore say out loud. */
export type VoiceTarget = {
  id: string;
  label: string;
  kind?: "select" | "action" | "navigate" | "input";
  destructive?: boolean;
};

/**
 * `phrase` is what the user actually said. Most controls ignore it, but a target of
 * kind "input" is dictation: the words themselves are the payload, which is how
 * "create a cybersecurity agent that reviews Python" reaches the text box.
 */
type Handle = (id: string, phrase?: string) => void;
type Layer = { targets: VoiceTarget[]; handle: Handle };

type Store = {
  set: (key: string, layer: Layer | null) => void;
  read: () => { targets: VoiceTarget[]; handle: Handle };
  version: () => number;
};

const VoiceTargetContext = createContext<Store | null>(null);

/**
 * Holds every layer of controls currently on screen.
 *
 * A Map of layers rather than one slot: a screen, a nested view inside it and a panel
 * inside that each register their own layer, so voice reaches as deep as the UI nests.
 * A layer only ever removes itself, so a child unmounting can no longer wipe the
 * controls its parent still owns.
 *
 * Refs rather than state on purpose: registering must not re-render the app, and the
 * voice widget reads the merged list at send time, not at render time.
 */
export function VoiceTargetProvider({ children }: { children: ReactNode }) {
  const layers = useRef(new Map<string, Layer>());
  const version = useRef(0);

  const store = useRef<Store>({
    set(key, layer) {
      if (layer) layers.current.set(key, layer);
      else layers.current.delete(key);
      version.current += 1;
    },
    read() {
      // Merge every layer, remembering which one owns each id so an activation goes
      // back to the component that offered it -- not to a single global handler.
      const owners = new Map<string, { target: VoiceTarget; handle: Handle }>();
      for (const layer of layers.current.values()) {
        for (const target of layer.targets) {
          owners.set(target.id, { target, handle: layer.handle });
        }
      }
      return {
        targets: [...owners.values()].map((entry) => entry.target),
        // ponytail: on a duplicate id the layer registered later wins. Namespace ids
        // ("nav:agents", "agent:1a2b") and the collision never arises.
        handle: (id, phrase) => owners.get(id)?.handle(id, phrase),
      };
    },
    version: () => version.current,
  });

  return (
    <VoiceTargetContext.Provider value={store.current}>{children}</VoiceTargetContext.Provider>
  );
}

export function useVoiceTargetStore() {
  return useContext(VoiceTargetContext);
}

/**
 * Declare what this component can be told to do by voice.
 *
 * Call it from as many components as you like, at any depth -- each call owns its own
 * layer. The merged list travels with every spoken command, and the backend may only
 * return an id from it, so a mis-hearing can at worst activate something already
 * on screen.
 */
export function useVoiceTargets(targets: VoiceTarget[], handle: Handle) {
  const store = useContext(VoiceTargetContext);
  const key = useId(); // stable for the life of this component instance
  // Keep the newest handler without re-registering on every render.
  const handleRef = useRef(handle);
  handleRef.current = handle;

  // Compare by value: screens rebuild this array each render.
  const signature = JSON.stringify(targets.map((t) => [t.id, t.label, t.destructive]));

  useEffect(() => {
    if (!store) return;
    store.set(key, { targets, handle: (id, phrase) => handleRef.current(id, phrase) });
    return () => store.set(key, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, key, signature]);
}
