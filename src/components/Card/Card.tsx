import "./Card.css";

interface CardProps {
  title: string;
  description: string;
  image: string;
  url: string;
  github: string;
  software: string;
}

function Card({ title, description, image, url, github, software }: CardProps) {
  const isPlayable = url.startsWith("/demos/");

  return (
    <article className="project-card">
      <img src={image} alt={`${title} screenshot`} className="project-media" />
      <div className="project-body">
        {isPlayable && <p className="project-tag">Playable</p>}
        <h3 className="project-title">{title}</h3>
        <p className="project-stack">{software}</p>
        <p className="project-desc">{description}</p>
        <div className="project-actions">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="btn btn-solid-clay"
          >
            Visit
          </a>
          {github && (
            <a
              href={github}
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline-clay"
            >
              GitHub
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export default Card;
