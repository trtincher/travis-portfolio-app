import "./Card.scss";

interface CardProps {
  title: string;
  description: string;
  image: string;
  url: string;
  github: string;
  software: string;
}


function Card({ title, description, image, url, github, software }: CardProps) {
  const descriptionArray = description.split("|");

  return (
    <div className="Card">
      <div className="content_wrapper">
        <img src={image} alt="project image" />
        <div className="card_body">
          <div className="title">
            <h1>{title}</h1>
            <p className="card_sub">{software}</p>
          </div>

          <p className="card_article">
            {descriptionArray[0]}
            <span>{descriptionArray[1]}</span>
            {descriptionArray[2]}
          </p>
          <div className="card_btn_container">
            <div className="card_button">
              <a href={github} target="_blank">
                GitHub
              </a>
            </div>
            <div className="card_button">
              <a href={url} target="_blank">
                See Website
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Card;
