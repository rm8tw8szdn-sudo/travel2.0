import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateCountryEntitySet } from "./knowledge-country-baseline-schema.mjs";
import { validateKnowledgeCityEntitySet } from "./knowledge-city-baseline-schema.mjs";
import { createKnowledgeEntityLayerRepository } from "./knowledge-entity-layer-repository.mjs";
import { validateKnowledgePoiEntitySet } from "./knowledge-poi-baseline-schema.mjs";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = path.resolve(moduleDirectory, "../../..");

export const KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS = Object.freeze({
  countries: 99,
  cities: 718,
  pois: 4766,
  total: 5583,
});

export const KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS = Object.freeze({
  countries: Object.freeze([
    "data/knowledge/countries.p1a-pilot.json",
    "data/knowledge/batches/countries.p1a-batch01.json",
    "data/knowledge/batches/countries.p1a-batch02.json",
    "data/knowledge/batches/countries.p1a-batch03.json",
    "data/knowledge/batches/countries.p1a-batch04.json",
    "data/knowledge/batches/countries.p1a-batch05.json",
    "data/knowledge/batches/countries.p1a-batch06.json",
    "data/knowledge/batches/countries.p1a-batch07.json",
    "data/knowledge/batches/countries.p1a-batch08.json",
  ]),
  cities: Object.freeze([
    "data/knowledge/cities.p1b-pilot.json",
    "data/knowledge/batches/cities.p1b-batch01.json",
    "data/knowledge/batches/cities.p1b-batch02.json",
    "data/knowledge/batches/cities.p1b-batch03.json",
    "data/knowledge/batches/cities.p1b-batch04.json",
    "data/knowledge/batches/cities.p1b-batch05.json",
    "data/knowledge/batches/cities.p1b-batch06.json",
    "data/knowledge/batches/cities.p1b-batch07.json",
    "data/knowledge/batches/cities.p1b-batch08.json",
    "data/knowledge/batches/cities.p1b-batch09.json",
    "data/knowledge/batches/cities.p1b-batch10.json",
    "data/knowledge/batches/cities.p1b-batch11.json",
    "data/knowledge/batches/cities.p1b-batch12.json",
    "data/knowledge/batches/cities.p1b-batch13.json",
    "data/knowledge/batches/cities.p1b-batch14.json",
    "data/knowledge/batches/cities.p1b-batch15.json",
    "data/knowledge/batches/cities.p1b-batch16.json",
    "data/knowledge/batches/cities.p1b-batch17.json",
    "data/knowledge/batches/cities.p1b-batch18.json",
    "data/knowledge/batches/cities.p1b-batch19.json",
    "data/knowledge/batches/cities.p1b-batch20.json",
    "data/knowledge/batches/cities.p1b-batch21.json",
    "data/knowledge/batches/cities.p1b-batch22.json",
    "data/knowledge/batches/cities.p1b-batch23.json",
    "data/knowledge/batches/cities.p1b-batch24.json",
    "data/knowledge/batches/cities.p1b-batch25.json",
    "data/knowledge/batches/cities.p1b-batch26.json",
    "data/knowledge/batches/cities.p1b-batch27.json",
    "data/knowledge/batches/cities.p1b-batch28.json",
    "data/knowledge/batches/cities.p1b-batch29.json",
  ]),
  pois: Object.freeze([
    "data/knowledge/pois.p1b-pilot.json",
    "data/knowledge/batches/pois.p1b-batch01.json",
    "data/knowledge/batches/pois.p1b-batch02.json",
    "data/knowledge/batches/pois.p1b-batch03.json",
    "data/knowledge/batches/pois.p1b-batch04.json",
    "data/knowledge/batches/pois.p1b-batch05.json",
    "data/knowledge/batches/pois.p1b-batch06.json",
    "data/knowledge/batches/pois.p1b-batch07.json",
    "data/knowledge/batches/pois.p1b-batch08.json",
    "data/knowledge/batches/pois.p1b-batch09.json",
    "data/knowledge/batches/pois.p1b-batch10.json",
    "data/knowledge/batches/pois.p1b-batch11.json",
    "data/knowledge/batches/pois.p1b-batch12.json",
    "data/knowledge/batches/pois.p1b-batch13.json",
    "data/knowledge/batches/pois.p1b-batch14.json",
    "data/knowledge/batches/pois.p1b-batch15.json",
    "data/knowledge/batches/pois.p1b-batch16.json",
    "data/knowledge/batches/pois.p1b-batch17.json",
    "data/knowledge/batches/pois.p1b-batch18.json",
    "data/knowledge/batches/pois.p1b-batch19.json",
    "data/knowledge/batches/pois.p1b-batch20.json",
    "data/knowledge/batches/pois.p1b-batch21.json",
    "data/knowledge/batches/pois.p1b-batch22.json",
    "data/knowledge/batches/pois.p1b-batch23.json",
    "data/knowledge/batches/pois.p1b-batch24.json",
    "data/knowledge/batches/pois.p1b-batch25.json",
    "data/knowledge/batches/pois.p1b-batch26.json",
    "data/knowledge/batches/pois.p1b-batch27.json",
    "data/knowledge/batches/pois.p1b-batch28.json",
    "data/knowledge/batches/pois.p1b-batch29.json",
  ]),
});

function readPublishedAsset(projectRoot, relativePath, collectionKey) {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), "utf8"));
    if (!Array.isArray(value[collectionKey])) throw new Error(`expected a ${collectionKey} array`);
    return value[collectionKey];
  } catch (error) {
    throw new Error(`Failed to load published Knowledge Entity Layer asset ${relativePath}: ${error.message}`);
  }
}

function loadEntityType(projectRoot, type) {
  return KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS[type]
    .flatMap((relativePath) => readPublishedAsset(projectRoot, relativePath, type));
}

function assertValidEntitySet(label, validation) {
  if (!validation.accepted) {
    throw new Error(`Published Knowledge Entity Layer ${label} validation failed: ${JSON.stringify(validation.reasons)}`);
  }
}

function countRepositoryEntities(repository) {
  const countries = repository.listCountries().length;
  const cities = repository.listCities().length;
  const pois = repository.listPois().length;
  return { countries, cities, pois, total: countries + cities + pois };
}

export function createPublishedKnowledgeEntityLayerRepository({ projectRoot = defaultProjectRoot } = {}) {
  const countries = loadEntityType(projectRoot, "countries");
  const cities = loadEntityType(projectRoot, "cities");
  const pois = loadEntityType(projectRoot, "pois");

  assertValidEntitySet("countries", validateCountryEntitySet(countries));
  assertValidEntitySet("cities", validateKnowledgeCityEntitySet(cities));
  assertValidEntitySet("POIs", validateKnowledgePoiEntitySet(pois));

  const repository = createKnowledgeEntityLayerRepository({ countries, cities, pois });
  const parentValidation = repository.validateParentReferences();
  if (!parentValidation.accepted) {
    throw new Error(`Published Knowledge Entity Layer parent validation failed: ${JSON.stringify(parentValidation.reasons)}`);
  }

  const totals = countRepositoryEntities(repository);
  if (JSON.stringify(totals) !== JSON.stringify(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS)) {
    throw new Error(`Published Knowledge Entity Layer totals mismatch: expected ${JSON.stringify(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS)}, received ${JSON.stringify(totals)}`);
  }

  return repository;
}
