// The steps of one reply, handed to the steps screen. The chat list can't pass objects through the
// route, and a run's steps change while it works, so the open page reads them live from here.
import { createStore, useStore } from "../store";
import type { Step } from "../chat-model";

type Open = { botId: string; turnId: string; steps: Step[] };
const store = createStore<Record<string, Open>>({});

export const setStepsPage = (botId: string, turnId: string, steps: Step[]) =>
  store.set((s) => ({ ...s, [`${botId}/${turnId}`]: { botId, turnId, steps } }));

export const useStepsPage = (botId: string, turnId: string) =>
  useStore(store, (s) => s[`${botId}/${turnId}`]);
