export interface ResumeData {
  name: string;
  position: string;
  summary?: string;
  tagline?: string;
  selectedWork?: SelectedWork;
  email: string;
  phone: string;
  linkedin: string;
  github: string;
  experience: Experience[] | null;
  education: Education[] | null;
  skills: Skills | null;
  hobbies: string[];
}

export interface Experience {
  company: string;
  position: string;
  startDate: string;
  endDate: string;
  summary: string[];
}

export interface Education {
  institution: string;
  degree: string;
  startDate: string;
  endDate: string;
}

export interface Skills {
  Languages: string[];
  Backend: string[];
  Frontend: string[];
  DevOps: string[];
  'AI agents': string[];
};

export enum SkillType {
  Languages = 'LANGUAGES',
  Frontend = 'FRONT END',
  Backend = 'BACK END',
  DevOps = 'DEV OPS',
  Other = 'OTHER',
}
export interface SelectedWork {
  title: string;
  period: string;
  bullets: string[];
}
