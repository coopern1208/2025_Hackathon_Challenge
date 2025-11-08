const GRAPH_PATH = "../parser/graph.json";
const DEFAULT_TIME_STEP = 30;

let cachedGraphData = null;
let availableTimeSteps = [];
let currentTimeStep = null;

async function loadGraphData(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load graph data: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function createSimulation(nodes, links) {
  return d3
    .forceSimulation(nodes)
    .force(
      "link",
      d3
        .forceLink(links)
        .id(d => d.id)
        .distance(80)
    )
    .force("charge", d3.forceManyBody().strength(-50))
    .force("center", d3.forceCenter(0, 0))
    .force("collision", d3.forceCollide().radius(24));
}

function initSvg(width, height) {
  const svg = d3
    .select("#graph")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [-width / 2, -height / 2, width, height].join(" "))
    .attr("style", "max-width: 100%; height: auto;");

  // Clear any previous render.
  svg.selectAll("*").remove();

  return svg;
}

function renderGraph(data) {
  const width = 928;
  const height = 400;
  const boundaryPadding = 40;
  const xMin = -width / 2 + boundaryPadding;
  const xMax = width / 2 - boundaryPadding;
  const yMin = -height / 2 + boundaryPadding;
  const yMax = height / 2 - boundaryPadding;

  const nodes = data?.nodes?.map(d => ({ ...d })) ?? [];
  const links = data?.edges?.map(d => ({ ...d })) ?? [];

  if (!nodes.length || !links.length) {
    throw new Error("Graph data is missing nodes or edges.");
  }

  const color = d3.scaleOrdinal(d3.schemeCategory10);
  const simulation = createSimulation(nodes, links);
  const svg = initSvg(width, height);

  const resolveColor = d => color(d.type ?? "default");

  const link = svg
    .append("g")
    .attr("stroke", "#999")
    .attr("stroke-opacity", 0.6)
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke-width", d => {
      d.__baseWidth = Math.sqrt(d.value ?? 1);
      d.__baseColor = "#999";
      return d.__baseWidth;
    });

  const node = svg
    .append("g")
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5)
    .selectAll("circle")
    .data(nodes)
    .join("circle")
    .attr("r", 12)
    .attr("fill", d => {
      d.__baseColor = resolveColor(d);
      return d.__baseColor;
    })
    .call(
      d3
        .drag()
        .on("start", event => dragstarted(event, simulation))
        .on("drag", dragged)
        .on("end", event => dragended(event, simulation))
    );

  node
    .on("mouseenter", (event, target) => setHighlightState(target, true))
    .on("mouseleave", (event, target) => setHighlightState(target, false));

  node.append("title").text(d => {
    const labelParts = [d.name ?? d.id];
    if (d.type) {
      labelParts.push(`type: ${d.type}`);
    }
    return labelParts.join("\n");
  });

  const label = svg
    .append("g")
    .selectAll("text")
    .data(nodes)
    .join("text")
    .attr("fill", "#222")
    .attr("font-size", 10)
    .attr("text-anchor", "middle")
    .attr("dy", "2.2em")
    .text(d => d.name ?? d.id);

  simulation.on("tick", () => {
    nodes.forEach(d => {
      d.x = Math.max(xMin, Math.min(xMax, d.x));
      d.y = Math.max(yMin, Math.min(yMax, d.y));
    });

    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    node.attr("cx", d => d.x).attr("cy", d => d.y);

    label.attr("x", d => d.x).attr("y", d => d.y);
  });

  function setHighlightState(targetNode, isActive) {
    node
      .attr("fill", d => d.__baseColor)
      .attr("stroke", d => (isActive && d === targetNode ? "#000" : "#fff"))
      .attr("stroke-width", d => (isActive && d === targetNode ? 3 : 1.5));

    label.attr("font-weight", "400");

    link
      .attr("stroke", d => {
        if (!isActive) {
          return d.__baseColor;
        }
        return linkTouchesNode(d, targetNode) ? "#000" : d.__baseColor;
      })
      .attr("stroke-width", d => {
        if (!isActive) {
          return d.__baseWidth ?? 1.5;
        }
        return linkTouchesNode(d, targetNode) ? Math.max(d.__baseWidth ?? 1.5, 3) : d.__baseWidth ?? 1.5;
      })
      .attr("stroke-opacity", 0.6);
  }

  function linkTouchesNode(linkDatum, nodeDatum) {
    const sourceId = linkDatum.source?.id ?? linkDatum.source;
    const targetId = linkDatum.target?.id ?? linkDatum.target;
    return sourceId === nodeDatum.id || targetId === nodeDatum.id;
  }
}

function getTimeSteps(data) {
  if (!data || typeof data !== "object") {
    return [];
  }

  return Object.keys(data)
    .map(key => Number(key))
    .filter(step => Number.isFinite(step))
    .sort((a, b) => a - b);
}

function hasOwnProperty(target, key) {
  return Object.prototype.hasOwnProperty.call(target ?? {}, key);
}

function getTimeStepData(data, step) {
  if (!data) {
    return null;
  }

  if (hasOwnProperty(data, step)) {
    return data[step];
  }

  const stringKey = String(step);
  if (hasOwnProperty(data, stringKey)) {
    return data[stringKey];
  }

  return null;
}

function updateTimeStepLabel(step) {
  const label = document.getElementById("time-step-value");
  if (label) {
    label.textContent = String(step);
  }
}

function syncSliderValue(step) {
  const slider = document.getElementById("time-slider");
  if (!slider || availableTimeSteps.length === 0) {
    return;
  }

  const index = availableTimeSteps.indexOf(step);
  if (index >= 0) {
    slider.value = String(index);
    slider.setAttribute("aria-valuetext", String(step));
  }
}

function renderTimeStep(step) {
  const timestepData = getTimeStepData(cachedGraphData, step);
  if (!timestepData) {
    console.warn(`Graph data does not contain time step ${step}.`);
    return;
  }
  renderGraph(timestepData);
}

function setCurrentTimeStep(step) {
  if (!availableTimeSteps.includes(step)) {
    console.warn(`Time step ${step} is not available in the dataset.`);
    return;
  }

  currentTimeStep = step;
  updateTimeStepLabel(step);
  syncSliderValue(step);
  renderTimeStep(step);
}

function handleTimeSliderInput(event) {
  const index = Number(event.target.value);
  if (!Number.isInteger(index) || index < 0 || index >= availableTimeSteps.length) {
    return;
  }

  const nextStep = availableTimeSteps[index];
  if (typeof nextStep === "undefined") {
    return;
  }

  setCurrentTimeStep(nextStep);
}

function setupTimeSlider(initialStep) {
  const slider = document.getElementById("time-slider");
  if (!slider) {
    return;
  }

  slider.min = "0";
  slider.max = String(Math.max(availableTimeSteps.length - 1, 0));
  slider.step = "1";
  slider.disabled = availableTimeSteps.length <= 1;

  slider.removeEventListener("input", handleTimeSliderInput);
  slider.addEventListener("input", handleTimeSliderInput);

  syncSliderValue(initialStep);
}

function dragstarted(event, simulation) {
  if (!event.active) simulation.alphaTarget(0.3).restart();
  event.subject.fx = event.subject.x;
  event.subject.fy = event.subject.y;
}

function dragged(event) {
  event.subject.fx = event.x;
  event.subject.fy = event.y;
}

function dragended(event, simulation) {
  if (!event.active) simulation.alphaTarget(0);
  event.subject.fx = null;
  event.subject.fy = null;
}

async function boot() {
  try {
    cachedGraphData = await loadGraphData(GRAPH_PATH);
    availableTimeSteps = getTimeSteps(cachedGraphData);

    if (!availableTimeSteps.length) {
      throw new Error("Graph data does not contain any time steps.");
    }

    const initialStep = availableTimeSteps.includes(DEFAULT_TIME_STEP)
      ? DEFAULT_TIME_STEP
      : availableTimeSteps[0];

    setupTimeSlider(initialStep);
    setCurrentTimeStep(initialStep);
  } catch (error) {
    console.error(error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}