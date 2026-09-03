export interface FaqItem {
  q: string;
  a: string;
}

export interface BenefitItem {
  title: string;
  text: string;
}

export interface KpiItem {
  value: string;
  label: string;
}

export interface ProductLocaleContent {
  metaTitle: string;
  metaDescription: string;
  navLabel: string;
  heroKicker: string;
  h1: string;
  heroSub: string;
  problemTitle: string;
  problemText: string;
  solutionTitle: string;
  solutionText: string;
  benefits: BenefitItem[];
  features: BenefitItem[];
  useCases: string[];
  relatedModules: string[];
  faq: FaqItem[];
  ctaTitle: string;
  ctaSub: string;
}

export interface ProductEntry {
  id: string;
  slugEs: string;
  slugEn: string;
  es: ProductLocaleContent;
  en: ProductLocaleContent;
}

export interface IndustryLocaleContent {
  metaTitle: string;
  metaDescription: string;
  navLabel: string;
  heroKicker: string;
  h1: string;
  heroSub: string;
  painTitle: string;
  pains: BenefitItem[];
  howTitle: string;
  howText: string;
  flow: string[];
  useCases: string[];
  automations: string[];
  kpis: KpiItem[];
  faq: FaqItem[];
  ctaTitle: string;
  ctaSub: string;
}

export interface IndustryEntry {
  id: string;
  slugEs: string;
  slugEn: string;
  es: IndustryLocaleContent;
  en: IndustryLocaleContent;
}

export interface ComparisonRow {
  feature: string;
  competitor: string;
  vendrava: string;
}

export interface ComparisonLocaleContent {
  metaTitle: string;
  metaDescription: string;
  navLabel: string;
  competitorName: string;
  heroKicker: string;
  h1: string;
  heroSub: string;
  positioningTitle: string;
  positioningText: string;
  rows: ComparisonRow[];
  fitTitle: string;
  fitPoints: string[];
  faq: FaqItem[];
  ctaTitle: string;
  ctaSub: string;
}

export interface ComparisonEntry {
  id: string;
  slugEs: string;
  slugEn: string;
  es: ComparisonLocaleContent;
  en: ComparisonLocaleContent;
}

export interface ResourceItem {
  title: string;
  description: string;
  cluster: string;
}

export interface BlogPostLocale {
  title: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  readingTime: string;
  sections: { h: string; body: string[] }[];
  keyTakeaways: string[];
  faq: FaqItem[];
}

export interface BlogPost {
  id: string;
  slugEs: string;
  slugEn: string;
  cluster: string;
  date: string;
  es: BlogPostLocale;
  en: BlogPostLocale;
}

export interface GlossaryItem {
  term: string;
  definition: string;
}

export interface IconLabel {
  icon: string;
  label: string;
}

export interface NavItem {
  label: string;
  routeKey: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export interface CommonContent {
  nav: {
    product: NavGroup;
    solutions: string;
    industries: string;
    resources: string;
    pricing: string;
    security: string;
  };
  cta: {
    primary: string;
    secondary: string;
    talkToSales: string;
    exploreAgents: string;
    discover: string;
    start: string;
  };
  footer: {
    tagline: string;
    rights: string;
    built: string;
    languageLabel: string;
    columns: {
      product: { title: string; items: NavItem[] };
      industries: { title: string; items: NavItem[] };
      resources: { title: string; items: NavItem[] };
      company: { title: string; items: NavItem[] };
      legal: { title: string; items: NavItem[] };
    };
  };
  breadcrumbHome: string;
  langSwitcher: { es: string; en: string };
}

export interface HomeContent {
  hero: {
    badge: string;
    h1a: string;
    h1b: string;
    sub: string;
    secondary: string;
    micro: string;
    trust: string;
    channels: string[];
    badges: string[];
  };
  comoFunciona: {
    tag: string;
    title: string;
    steps: { n: string; t: string; d: string }[];
    note: string;
    screenshot: { src: string; caption: string };
  };
  problem: {
    tag: string;
    title: string;
    text: string;
    items: { n: string; title: string; text: string }[];
    kicker: string;
  };
  solution: {
    tag: string;
    title: string;
    text: string;
    inputs: IconLabel[];
    outputs: IconLabel[];
  };
  differentiator: {
    tag: string;
    title: string;
    text: string;
    chatLabel: string;
    chatPoints: string[];
    vendLabel: string;
    vendPoints: string[];
  };
  inboundOutbound: {
    tag: string;
    title: string;
    sub: string;
    outLabel: string;
    outItems: string[];
    inLabel: string;
    inItems: string[];
  };
  afterHours: {
    tag: string;
    title: string;
    text: string;
    steps: { t: string; title: string; text: string }[];
  };
  howItWorks: {
    tag: string;
    title: string;
    steps: { n: string; title: string; text: string; tag: string }[];
  };
  dualAI: {
    tag: string;
    title: string;
    sub: string;
    mini: { name: string; rows: string[] }[];
    cards: { name: string; tag: string; text: string }[];
  };
  voiceAgents: {
    tag: string;
    title: string;
    text: string;
    signals: { k: string; v: string }[];
    scenarios: {
      tab: string;
      name: string;
      meta: string;
      badge: string;
      transcript: { who: string; text: string }[];
      facts: { k: string; v: string }[];
      action: string;
    }[];
  };
  advisor: {
    tag: string;
    title: string;
    sub: string;
    nicheLabel: string;
    niches: string[];
    cards: { title: string; text: string }[];
  };
  nichePlayground: {
    tag: string;
    title: string;
    sub: string;
    langNote: string;
    agentLabel: string;
    askLabel: string;
    objectionLabel: string;
    nextLabel: string;
    sectors: {
      id: string;
      name: string;
      greeting: string;
      questions: string[];
      objections: string[];
      next: string;
    }[];
  };
  crmPipeline: {
    tag: string;
    title: string;
    text: string;
    hint: string;
    columns: string[];
    aiNote: string;
    cards: {
      name: string;
      company: string;
      source: string;
      score: number;
      ai: string;
      next: string;
      ago: string;
      col: number;
      accent: "cyan" | "violet" | "electric" | "gold" | "success";
    }[];
  };
  automation: {
    tag: string;
    title: string;
    text: string;
    trigLabel: string;
    triggers: string[];
    actLabel: string;
    actions: IconLabel[];
    nodeLabel: string;
  };
  dayInLife: {
    tag: string;
    title: string;
    items: { t: string; title: string; text: string; side: "l" | "r" }[];
  };
  demo: {
    badge: string;
    title: string;
    sub: string;
    unit: string;
    use: string;
    benefits: string[];
    cta: string;
    cta2: string;
    note: string;
    meters: { k: string; v: number }[];
  };
  growthHub: {
    tag: string;
    title: string;
    text: string;
    modules: { name: string; span: number; desc: string; val: string; iconKey: string }[];
  };
  capabilities: {
    tag: string;
    title: string;
    groups: { name: string; items: string[] }[];
  };
  industries: {
    tag: string;
    title: string;
    items: { name: string; pain: string; flow: string; result: string; hot: boolean }[];
  };
  beforeAfter: {
    tag: string;
    title: string;
    beforeLabel: string;
    afterLabel: string;
    before: string[];
    after: string[];
  };
  comparison: {
    tag: string;
    title: string;
    sub: string;
    tradLabel: string;
    vendLabel: string;
    rows: { trad: string; vend: string }[];
  };
  socialProof: {
    tag: string;
    title: string;
    items: string[];
    strip: string;
  };
  security: {
    tag: string;
    title: string;
    text: string;
    items: { icon: string; title: string; text: string }[];
  };
  faq: {
    tag: string;
    title: string;
    items: FaqItem[];
  };
  finalCta: {
    title: string;
    sub: string;
    primary: string;
    secondary: string;
  };
}
