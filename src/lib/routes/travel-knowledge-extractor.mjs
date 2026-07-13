import { evidenceFromRouteRecord } from "./evidence-repository.mjs";

export function createAcceptedRouteKnowledgeExtractor() {
  return {
    extract(record) {
      return evidenceFromRouteRecord(record).map((item) => {
        const evidence = { ...item };
        delete evidence.routeId;
        return evidence;
      });
    },
  };
}
