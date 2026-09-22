import React from "react";

// Import Styles
import './Home.css';

// Import Data
import resumeData from '../../data/fullStack.json';

// Import Components
import PortDeck from "../../components/PortDeck/PortDeck";

// Import Images
import profileImage from '../../assets/Travis-Headshot.jpg';

// Import SVGs
import LinkedInIcon from '../../assets/linkedin.svg';
import GitHubIcon from '../../assets/github.svg';
import Download from '../../assets/download.svg';

// Import PDF
import resumePDF from '../../assets/Travis-Resume.pdf';

const skillGroups = Object.entries(resumeData.skills) as [string, string[]][];

const projectsIntro =
  "Small playable experiments from a games pipeline I run with AI agents; each is a few hundred lines, built in an afternoon. Tap one on your phone.";

const Home: React.FC = () => {
  return (
    <div className="home">
      <header className="hero">
        <div className="wrap hero-inner">
          <img
            src={profileImage}
            alt={`${resumeData.name}, headshot`}
            className="hero-photo"
            width={320}
            height={320}
          />
          <div className="hero-copy">
            <h1 className="hero-name">{resumeData.name}</h1>
            <p className="hero-position">{resumeData.position}</p>
            <p className="hero-tagline">{resumeData.tagline}</p>
            <div className="hero-actions">
              <a
                href={resumePDF}
                target="_blank"
                rel="noreferrer"
                className="btn btn-solid-cream"
              >
                <img src={Download} alt="" aria-hidden="true" className="btn-icon btn-icon-dark" />
                Resume
              </a>
              <a
                href={resumeData.github}
                target="_blank"
                rel="noreferrer"
                className="btn btn-outline-cream"
              >
                <img src={GitHubIcon} alt="" aria-hidden="true" className="btn-icon" />
                GitHub
              </a>
              <a
                href={resumeData.linkedin}
                target="_blank"
                rel="noreferrer"
                className="btn btn-outline-cream"
              >
                <img src={LinkedInIcon} alt="" aria-hidden="true" className="btn-icon" />
                LinkedIn
              </a>
            </div>
          </div>
        </div>
      </header>

      <main>
        <section className="section" id="about" aria-labelledby="about-heading">
          <div className="wrap">
            <h2 className="section-heading" id="about-heading">About</h2>
            <p className="about-text">{resumeData.summary}</p>
          </div>
        </section>

        <section className="section" id="experience" aria-labelledby="experience-heading">
          <div className="wrap">
            <h2 className="section-heading" id="experience-heading">Experience</h2>
            <ol className="exp-list">
              {resumeData.experience.map((job, index) => (
                <li className="exp-item" key={`${job.company}-${index}`}>
                  <div className="exp-head">
                    <div className="exp-id">
                      <h3 className="exp-position">{job.position}</h3>
                      <p className="exp-company">{job.company}</p>
                    </div>
                    <p className="exp-dates">
                      {job.startDate} – {job.endDate}
                    </p>
                  </div>
                  <ul className="exp-bullets">
                    {job.summary.map((line, lineIndex) => (
                      <li key={lineIndex}>{line}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section" id="projects" aria-labelledby="projects-heading">
          <div className="wrap">
            <h2 className="section-heading" id="projects-heading">Projects and toys</h2>
            <p className="section-intro">{projectsIntro}</p>
            <PortDeck />
          </div>
        </section>

        <section className="section" id="skills" aria-labelledby="skills-heading">
          <div className="wrap">
            <h2 className="section-heading" id="skills-heading">Skills</h2>
            <dl className="skill-groups">
              {skillGroups.map(([category, items]) => (
                <div className="skill-row" key={category}>
                  <dt className="skill-label">{category}</dt>
                  <dd className="skill-chips">
                    {items.map((skill) => (
                      <span className="chip" key={skill}>{skill}</span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="section" id="education" aria-labelledby="education-heading">
          <div className="wrap">
            <h2 className="section-heading" id="education-heading">Education</h2>
            <ul className="edu-list">
              {resumeData.education.map((school, index) => (
                <li className="edu-item" key={`${school.institution}-${index}`}>
                  <div className="edu-id">
                    <h3 className="edu-institution">{school.institution}</h3>
                    <p className="edu-degree">{school.degree}</p>
                  </div>
                  <p className="edu-date">{school.endDate}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap footer-inner">
          <a href={`mailto:${resumeData.email}`} className="footer-email">
            {resumeData.email}
          </a>
          <p className="footer-legal">© 2026 Travis Tincher</p>
        </div>
      </footer>
    </div>
  );
}

export default Home;
