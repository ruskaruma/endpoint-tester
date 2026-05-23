import endpointsJson from "./endpoints.json";
import type { EndpointDefinition, ParameterDef } from "./types";

/** Shape of each endpoint row inside endpoints.json (no app/base_url; header optional). */
export type EndpointDefinitionFromFile = Omit<
  EndpointDefinition,
  "app" | "base_url" | "parameters"
> & {
  parameters: {
    query: ParameterDef[];
    path: ParameterDef[];
    header?: ParameterDef[];
    body: EndpointDefinition["parameters"]["body"];
  };
};

export type EndpointsFile = Record<
  string,
  { base_url: string; endpoints: EndpointDefinitionFromFile[] }
>;

export function flattenEndpoints(data: EndpointsFile): EndpointDefinition[] {
  const all: EndpointDefinition[] = [];
  for (const [app, config] of Object.entries(data)) {
    for (const ep of config.endpoints) {
      all.push({
        ...ep,
        app,
        base_url: config.base_url,
        parameters: {
          query: ep.parameters.query ?? [],
          header: ep.parameters.header ?? [],
          path: ep.parameters.path ?? [],
          body: ep.parameters.body ?? null,
        },
      });
    }
  }
  return all;
}

export function loadEndpoints(): EndpointDefinition[] {
  return flattenEndpoints(endpointsJson as EndpointsFile);
}
