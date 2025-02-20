import React from "react";

// Import Styles
import './Home.css';

// Import Data
import resumeData from '../../data/fullStack.json';

// Import Types
import { Skills } from "../../types/types";

// Import Images
import profileImage from '../../assets/Travis-Headshot.jpg';

// Import SVGs
import LinkedInIcon from '../../assets/linkedin.svg';
import GitHubIcon from '../../assets/github.svg';
import EmailIcon from '../../assets/mail.svg';
import Download from '../../assets/download.svg';


const Home: React.FC = () => {
  return (
    <div className="home-container">
        <div className="banner-block">
          <div className="banner-text">
            <h1 className="banner-title">Hello I am</h1>
            <h1 className="banner-name">{resumeData.name}</h1>
          </div>
          <div className="banner-image-container">
            <img src={profileImage} alt="Profile" className="banner-image" />
          </div>
          <div className="banner-shape"></div>
        </div>

        <div className="summary-block">
          <div className="about-me">
            <h2 className="about-me-title">Full Stack Software Developer</h2>
            <p className="about-me-job-title">
              Learn, Create, Innovate
            </p>
            <div className="contact-block">
              <button className="contact-button">
                <img src={Download} alt="Download" className="contact-icon"/>
                <p className="cv-button-text">Resume</p>
              </button>
              <button className="contact-button">
                <img src={LinkedInIcon} alt="LinkedIn" />
              </button>
              <button className="contact-button">
                <img src={GitHubIcon} alt="GitHub" />
              </button>
              <button className="contact-button">
                <img src={EmailIcon} alt="Email" />
              </button>
            </div>
          </div>

          <div className="summary">
            <p>
              {resumeData.summary}
            </p>
          </div>
        </div>


        <div className="info-block">
          <div className="skills-block">
            <h2 className="skills-title">Skills</h2>
            <div className="skills-category-list">
              {Object.keys(resumeData.skills as Skills).map((category, index) => (
                <div key={index} className="skill-category">
                  <h3 className="skill-category-title">{category}</h3>
                  <ul className="skills-list">
                    {resumeData.skills[category as keyof Skills].map((skill: string, skillIndex: number) => (
                      <li key={skillIndex} className="skill-item">{skill}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="experience-block">
            <h2 className="experience-title">Experience</h2>
            <div className="experience-list">
              {resumeData.experience.map((experience, index) => (
                <div key={index} className="experience-item">
                  <h3 className="item-position">{experience.position}</h3>
                  <p className="item-company">{experience.company}</p>
                  <p className="item-date">{experience.startDate} - {experience.endDate}</p>
                  <ul>
                    {experience.summary.map((summary, summaryIndex) => (
                      <li key={summaryIndex} className="item-summary">{summary}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>

    </div>
  );
}

export default Home;