import { createContext, useContext } from "react";

/**
 * Whether the API as a whole is unreachable, as opposed to one endpoint
 * failing. The shell decides from its own small request for the newest event;
 * panels read it so that an outage shows one calm notice at the top instead
 * of a red error in every panel.
 */
export const ApiStatusContext = createContext(false);

export const useApiDown = () => useContext(ApiStatusContext);
