// Plain-code authorization for cleanup categories. A model cannot turn a sorting request into deletion.
const ALL = /as much space as possible|maximum (?:space|cleanup)|all (?:developer |dev )?clutter/i;
const CLEAN = /\b(?:clean|cleanup|clear|remove|delete|free|reclaim|purge|empty)\b/i;
const KEEP = /\b(?:keep|except|don'?t|do not|never|retain|still need|leave|without|avoid|exclude|no)\b|\bnot(?!\s+(?:used|accessed|needed|downloaded|changed)\b)/i;
const ML = /\bmodels?\b|hugging\s?face|pytorch|torch/i;
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentions = (text, name) => new RegExp(`(^|[^\\w./-])${escape(name)}($|[^\\w./-])`, 'i').test(text);

function cleanupIntent(request = '', models = [], dockerItems = []) {
  const declined = [...String(request).matchAll(/\(User answered "([\s\S]*?)" with "([^"]*)"\)/g)]
    .filter((match) => /^(?:no\b|cancel\b|leave\b|keep\b)/i.test(match[2]));
  // The planner's own question is appended by Engine.answer as context, not as new user authorization.
  const authorized = String(request).split(/\s*\(User (?:answered|picked)\b/i)[0];
  const clauses = authorized.replace(/[’‘]/g, "'").split(/[;!?,]|\.(?=\s|$)|\bbut\b|\band\s+(?=keep|leave|don'?t|do not)/i);
  const kept = clauses.filter((c) => KEEP.test(c));
  const positive = clauses.filter((c) => !KEEP.test(c)).join(' ');
  const all = ALL.test(positive);
  const cleaning = CLEAN.test(positive) || all;
  const keptModels = models.filter((m) => kept.some((c) => mentions(c, m.model))).map((m) => m.model);
  const namedModels = models.filter((m) => !keptModels.includes(m.model) && mentions(positive, m.model)).map((m) => m.model);
  const negativeCategory = declined.some((match) => ML.test(match[1])) || kept.some((c) => ML.test(models.reduce((text, m) => text.replace(new RegExp(escape(m.model), 'gi'), ''), c)));
  const negativeDocker = declined.some((match) => /docker/i.test(match[1])) || kept.some((c) => /docker/i.test(c) || dockerItems.some((d) => {
    const name = d.name || '';
    const repo = name.split(':')[0].split('/').at(-1);
    return name && (c.toLowerCase().includes(name.toLowerCase()) || (repo && mentions(c, repo)));
  }));
  return { allClutter: all, docker: cleaning && !negativeDocker && (all || /docker/i.test(positive)),
    ml: cleaning && !negativeCategory && (all || ML.test(positive) || namedModels.length > 0),
    namedModels: cleaning ? namedModels : [], onlyNamedModels: namedModels.length > 0 && !all && !/\ball models?\b/i.test(positive), keptModels };
}

module.exports = { cleanupIntent };
