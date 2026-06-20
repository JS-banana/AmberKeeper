export interface RuntimeArtifactMatch {
  ruleId: string;
  value: string;
}

export interface ConfigMatch {
  ruleId: string;
  lineNumber: number;
  line: string;
}

export declare function findForbiddenConfigMatches(configText: string): ConfigMatch[];

export declare function findForbiddenRuntimeArtifactMatches(
  candidates: string[]
): RuntimeArtifactMatch[];
