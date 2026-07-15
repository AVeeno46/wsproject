// [ViewModel] 검색어(유사어) 사전 화면의 상태와 로직을 담는 hook.
import { useState } from "react";
import { fetchSynonymsRequest, saveSynonymsRequest } from "../models/synonymModel";

export function useSynonymViewModel() {
  const [items, setItems] = useState(() => fetchSynonymsRequest());
  const [isSaved, setIsSaved] = useState(true);

  const addItem = () => {
    const newItem = { id: Date.now(), keyword: "", synonyms: "" };
    setItems((prev) => [...prev, newItem]);
    setIsSaved(false);
    return newItem.id;
  };

  const updateKeyword = (id, value) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, keyword: value } : item))
    );
    setIsSaved(false);
  };

  const updateSynonyms = (id, value) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, synonyms: value } : item))
    );
    setIsSaved(false);
  };

  const deleteItem = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setIsSaved(false);
  };

  const save = () => {
    saveSynonymsRequest(items);
    setIsSaved(true);
  };

  return { items, isSaved, addItem, updateKeyword, updateSynonyms, deleteItem, save };
}
