import { useEffect, useState } from "react";
import "./PortDeck.scss";
import Card from "../Card/Card";
import data from "../../data/activeProjects.json"; // Import the JSON data

interface Project {
  title: string;
  description: string;
  image: string;
  url: string;
  github: string;
  software: string;
}

const makeProjects = (projects: Project[]) => {
  const projectCards = projects.map((project) => {
    console.log("project in makeProjects", project);
    return (
      <Card
        key={project.title}
        title={project.title}
        description={project.description}
        image={project.image}
        url={project.url}
        github={project.github}
        software={project.software}
      />
    );
  });

  return projectCards;
};

function PortDeck() {
  const [projectList, setProjectList] = useState<JSX.Element[] | undefined>();

  useEffect(() => {
    // Directly use the imported JSON data
    const list = makeProjects(data);
    setProjectList(list);
  }, []);

  return <div className="PortDeck">{projectList}</div>;
}

export default PortDeck;