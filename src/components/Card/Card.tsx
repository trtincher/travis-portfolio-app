import "./Card.css";

interface CardProps {
  title: string;
  description: string;
  image: string;
  url: string;
  github: string;
  software: string;
  playable?: boolean;
  tag?: string;
}

function Card({
  title,
  description,
  image,
  url,
  github,
  software,
  playable,
  tag,
}: CardProps) {
  const isPlayable = playable ?? url.startsWith("/demos/");
  const label = tag ?? (isPlayable ? "Playable" : undefined);

  return (
    <article className="project-card">
      <img src={image} alt={`${title} screenshot`} className="project-media" />
      <div className="project-body">
        {label && <p className="project-tag">{label}</p>}
        <h3 className="project-title">{title}</h3>
        <p className="project-stack">{software}</p>
        <p className="project-desc">{description}</p>
        <div className="project-actions">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-solid-clay"
          >
            Visit
          </a>
          {github && (
            <a
              href={github}
              target="_blank"
              rel="noopener noreferrer"
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
