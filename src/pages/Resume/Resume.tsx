// src/components/ResumePreview.tsx
import React from 'react';
import { ResumeData } from '../../types/types';
import rawTestFormData from '../../data/fullStack.json';
import './Home.css'; 

const data: ResumeData = rawTestFormData;

const ResumePreview: React.FC = () => {
  const filteredSkills = {
    Languages: data.skills?.Languages,
    Frontend: data.skills?.Frontend,
    Backend: data.skills?.Backend,
    DevOps: data.skills?.DevOps,
  }

  return (
    <div id="home-page-container" className="home-grid-container">
      <div id='home-contact-block' className='home-grid-item'>
        {data.linkedin && <p className='info-text'>
          LinkedIn: <a href={data.linkedin} className="link-text">{data.linkedin}</a>
        </p>}
        {data.github && <p className='info-text'>
          GitHub: <a href={data.github} className="link-text">{data.github}</a>
        </p>}
      </div>
      <div id='home-summary-block' className='home-grid-item'>
        <h1 className="page-title">{data.name}</h1>
        <h2 className="block-title">{data.position}</h2>
        <p className="summary-text">{data.summary}</p>
      </div>
      <div id="home-experience-block"className='home-grid-item'>
        {data.experience && 
          <>
          <h2 className="experience-header block-title">Experience</h2>
          {data.experience.map((exp, index) => (
            <div className='experience-item' key={index}>
              <div className='experience-item-header'>
                <h3 className="company-name">{exp.company}</h3>
                <p>{exp.position}</p>
                <div className='experience-item-date-block'>
                  <p className='experience-item-date'>{exp.startDate}</p>
                  <p className='experience-item-date-separator'>-</p>
                  <p className='experience-item-date'>{exp.endDate}</p>
                </div>
              </div>
              <div className='experience-item-summary'>{
                exp.summary.map((summary, index) => (
                  <div className='experience-item-summary-item' key={index}>
                    <div className='bullet-point'></div>
                    <p>{summary}</p>
                  </div>
                ))
              }</div>
            </div>
          ))}
          </>
        }
      </div>
      <div id="home-skills-block" className='home-grid-item'>
        {data.skills && 
          <>
            <h2 className="skills-header block-title">Skills</h2>
            {filteredSkills.Languages && (
              <div className='skill-list'>
                <h3 className="skill-category section-title">Language</h3>
                {filteredSkills.Languages}
              </div>
            )}
            {filteredSkills.Frontend && (
              <div className='skill-list'>
                <h3 className="skill-category section-title">Frontend</h3>
                {filteredSkills.Frontend}
              </div>
            )}
            {filteredSkills.Backend && (
              <div className='skill-list'>
                <h3 className="skill-category section-title">Backend</h3>
                {filteredSkills.Backend}
              </div>
            )}
            {filteredSkills.DevOps && (
              <div className='skill-list'>
                <h3 className="skill-category section-title">DevOps</h3>
                {filteredSkills.DevOps}
              </div>
            )}
          </>
        }
      </div>
      <div id="home-education-block" className='home-grid-item'>
        {data.education && 
          <>
          <h2 className="education-header block-title">Education</h2>
          {data.education.map((edu, index) => (
            <div className='education-item' key={index}>
              <h3 className="institution-name">{edu.institution}</h3>
              <p>{edu.degree}</p>
              <div className='education-item-date-block'>
                <p>{edu.startDate}</p>
                <p className='date-separator'>-</p>
                <p>{edu.endDate}</p>
              </div>
            </div>
          ))}
          </>
        }
      </div>
      <div id="home-hobbies-block" className='home-grid-item'>
        {data.hobbies && data.hobbies.length > 0 && 
          <div className='hobbies-list'>
            <h2 className="hobbies-header block-title">Hobbies</h2>
            {data.hobbies.join(', ')}
          </div>
        }
      </div>
    </div>
  );
};

export default ResumePreview;