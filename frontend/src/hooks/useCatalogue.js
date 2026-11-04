import { createContext, useContext } from "react";

/**
 * The MITRE ATT&CK technique catalogue (GET /mitre), fetched once by the shell
 * and read by every panel that renders technique badges.
 */
export const CatalogueContext = createContext({ techniques: [], byId: {} });

export const useCatalogue = () => useContext(CatalogueContext);

/** "Ingress Tool Transfer (T1105)" -> "Ingress Tool Transfer". */
export const shortTechniqueName = (name = "") => name.replace(/\s*\(T\d+(?:\.\d+)?\)\s*$/, "");
