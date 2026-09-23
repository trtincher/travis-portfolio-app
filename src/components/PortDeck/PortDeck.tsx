import "./PortDeck.css";
import Card from "../Card/Card";
import projects from "../../data/activeProjects.json";

export interface Project {
  title: string;
  description: string;
  image: string;
  url: string;
  github: string;
  software: string;
  playable?: boolean;
}

/**
 * Project screenshots live in src/assets/projects and are referenced from
 * activeProjects.json by filename only. Vite resolves + fingerprints them at
 * build time through this eager glob, so the JSON stays free of bundler paths.
 */
const projectImages = import.meta.glob<string>(
  "../../assets/projects/*.{jpg,jpeg,png,webp,avif}",
  { eager: true, query: "?url", import: "default" }
);

const imageUrl = (file: string): string =>
  projectImages[`../../assets/projects/${file}`] ?? file;

function PortDeck() {
  const list = projects as Project[];

  return (
    <div className="port-deck">
      {list.map((project) => (
        <Card
          key={project.title}
          title={project.title}
          description={project.description}
          image={imageUrl(project.image)}
          url={project.url}
          github={project.github}
          software={project.software}
          playable={project.playable}
        />
      ))}
    </div>
  );
}

export default PortDeck;
