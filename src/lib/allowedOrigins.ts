export type AllowedOriginRule =
  | {
      type: 'exact';
      origin: string;
    }
  | {
      type: 'pattern';
      pattern: RegExp;
    };

const allowedOriginRulesCache = new Map<string, AllowedOriginRule[]>();

export function getAllowedOriginRules(
  allowedOrigins: string
): AllowedOriginRule[] {
  const cachedRules = allowedOriginRulesCache.get(allowedOrigins);
  if (cachedRules) {
    return cachedRules;
  }

  const rules = allowedOrigins
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(createAllowedOriginRule);

  allowedOriginRulesCache.set(allowedOrigins, rules);
  return rules;
}

export function isAllowedOrigin(
  origin: string,
  allowedOriginRules: AllowedOriginRule[]
): boolean {
  return allowedOriginRules.some(rule => {
    if (rule.type === 'exact') {
      return origin === rule.origin;
    }
    return rule.pattern.test(origin);
  });
}

function createAllowedOriginRule(allowedOrigin: string): AllowedOriginRule {
  if (!allowedOrigin.includes('*')) {
    return {
      type: 'exact',
      origin: allowedOrigin,
    };
  }

  const allowedOriginPattern = escapeRegExp(allowedOrigin).replace(
    /\\\*/g,
    '[^.]+'
  );
  return {
    type: 'pattern',
    pattern: new RegExp(`^${allowedOriginPattern}$`),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
