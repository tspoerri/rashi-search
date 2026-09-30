// Registry of corpora, in the order shown in the corpus switcher.
import { createTorah } from "./torah.js";
import { createNach } from "./nach.js";
import { createBavli } from "./bavli.js";

export const CORPUS_IDS = ["torah", "nach", "bavli"];
export const CORPUS_FACTORIES = { torah: createTorah, nach: createNach, bavli: createBavli };
// Legacy page URL -> corpus id (chumash.html / nach.html / bavli.html keep working).
export const PAGE_TO_CORPUS = { "chumash.html": "torah", "nach.html": "nach", "bavli.html": "bavli" };
