// SecureStore on Android/iOS; localStorage on web (the web build is only a demo preview).
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const web = Platform.OS === "web";
export const getItem = async (k: string) => (web ? globalThis.localStorage?.getItem(k) ?? null : SecureStore.getItemAsync(k));
export const setItem = async (k: string, v: string) => (web ? globalThis.localStorage?.setItem(k, v) : SecureStore.setItemAsync(k, v));
export const deleteItem = async (k: string) => (web ? globalThis.localStorage?.removeItem(k) : SecureStore.deleteItemAsync(k));
