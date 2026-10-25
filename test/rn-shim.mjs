// test-only stand-ins: react-native (web platform -> secure.ts uses localStorage) and expo-secure-store
export const Platform = { OS: "web" };
export const getItemAsync = async () => null, setItemAsync = async () => {}, deleteItemAsync = async () => {};
