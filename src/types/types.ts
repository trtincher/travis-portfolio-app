export interface ResumeData {
  name: string;
  position: string;
  summary?: string;
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
};

export enum SkillType {
  Languages = 'LANGUAGES',
  Frontend = 'FRONT END',
  Backend = 'BACK END',
  DevOps = 'DEV OPS',
  Other = 'OTHER',
}