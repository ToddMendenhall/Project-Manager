import type {
  ColorKey,
  ShapeKind,
  WhiteboardDoc,
  WhiteboardEdge,
  WhiteboardEdgeData,
  WhiteboardNode,
} from "@/lib/whiteboard";

/**
 * Starting layouts offered when creating a whiteboard. Each builds an
 * ordinary WhiteboardDoc, so a templated board is just a board — nothing
 * remembers which template it came from. Node ids only need to be unique
 * within one document.
 */

type Builder = {
  nodes: WhiteboardNode[];
  edges: WhiteboardEdge[];
  frame: (x: number, y: number, w: number, h: number, title: string, color?: ColorKey) => string;
  sticky: (x: number, y: number, text: string, color?: ColorKey) => string;
  shape: (shape: ShapeKind, x: number, y: number, w: number, h: number, text: string, color?: ColorKey) => string;
  text: (x: number, y: number, w: number, text: string, fontSize?: number) => string;
  connect: (
    source: string,
    target: string,
    sides?: [WhiteboardEdge["sourceHandle"], WhiteboardEdge["targetHandle"]],
    data?: Partial<WhiteboardEdgeData>,
  ) => void;
};

function build(fn: (b: Builder) => void): WhiteboardDoc {
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}-${++seq}`;
  const b: Builder = {
    nodes: [],
    edges: [],
    frame: (x, y, w, h, title, color = "gray") => {
      const id = nextId("frame");
      b.nodes.push({ id, type: "frame", position: { x, y }, width: w, height: h, data: { text: title, color } });
      return id;
    },
    sticky: (x, y, text, color = "yellow") => {
      const id = nextId("sticky");
      b.nodes.push({ id, type: "sticky", position: { x, y }, width: 160, height: 160, data: { text, color } });
      return id;
    },
    shape: (shape, x, y, w, h, text, color = "white") => {
      const id = nextId("shape");
      b.nodes.push({ id, type: "shape", position: { x, y }, width: w, height: h, data: { text, color, shape } });
      return id;
    },
    text: (x, y, w, text, fontSize = 24) => {
      const id = nextId("text");
      b.nodes.push({ id, type: "text", position: { x, y }, width: w, height: fontSize * 2, data: { text, color: "white", fontSize } });
      return id;
    },
    connect: (source, target, sides = ["right", "left"], data = {}) => {
      b.edges.push({
        id: nextId("edge"),
        source,
        target,
        sourceHandle: sides[0],
        targetHandle: sides[1],
        data: { label: "", routing: "elbow", arrow: "end", color: "gray", dashed: false, ...data },
      });
    },
  };
  fn(b);
  return { nodes: b.nodes, edges: b.edges };
}

const flowchart = () =>
  build((b) => {
    const start = b.shape("rounded", 0, 40, 160, 64, "Start", "green");
    const step1 = b.shape("rectangle", 240, 32, 160, 80, "First step");
    const decide = b.shape("diamond", 480, 17, 160, 110, "Decision?", "yellow");
    const yes = b.shape("rectangle", 720, 32, 160, 80, "Next step");
    const no = b.shape("rectangle", 480, 220, 160, 80, "Fix the issue", "orange");
    const end = b.shape("rounded", 960, 40, 160, 64, "End", "pink");
    b.connect(start, step1);
    b.connect(step1, decide);
    b.connect(decide, yes, ["right", "left"], { label: "Yes" });
    b.connect(decide, no, ["bottom", "top"], { label: "No" });
    b.connect(no, step1, ["left", "bottom"]);
    b.connect(yes, end);
  });

const swimlanes = () =>
  build((b) => {
    const lanes = [
      { title: "Customer", color: "blue" as const },
      { title: "Sales", color: "green" as const },
      { title: "Operations", color: "purple" as const },
    ];
    const laneH = 220;
    lanes.forEach((lane, i) => b.frame(0, i * (laneH + 20), 1240, laneH, lane.title, lane.color));
    const y = (lane: number) => lane * (laneH + 20) + 80;
    const request = b.shape("rounded", 60, y(0), 160, 64, "Places order");
    const review = b.shape("rectangle", 300, y(1) - 8, 160, 80, "Review order");
    const approve = b.shape("diamond", 540, y(1) - 23, 150, 110, "Approved?", "yellow");
    const fulfil = b.shape("rectangle", 780, y(2) - 8, 160, 80, "Fulfil order");
    const receive = b.shape("rounded", 1020, y(0), 160, 64, "Receives order");
    b.connect(request, review, ["bottom", "left"]);
    b.connect(review, approve);
    b.connect(approve, fulfil, ["bottom", "left"], { label: "Yes" });
    b.connect(approve, request, ["top", "right"], { label: "No", dashed: true });
    b.connect(fulfil, receive, ["right", "bottom"]);
  });

const sipoc = () =>
  build((b) => {
    const columns: [string, ColorKey, string][] = [
      ["Suppliers", "blue", "Who provides the inputs?"],
      ["Inputs", "green", "What goes into the process?"],
      ["Process", "yellow", "The 4–7 high-level steps"],
      ["Outputs", "orange", "What the process produces"],
      ["Customers", "pink", "Who receives the outputs?"],
    ];
    columns.forEach(([title, color, hint], i) => {
      const x = i * 260;
      b.frame(x, 0, 240, 560, title, color);
      b.sticky(x + 40, 70, hint, color);
    });
  });

const brainstorm = () =>
  build((b) => {
    const topic = b.shape("ellipse", 300, 220, 200, 120, "Main topic", "blue");
    const ideas: [number, number, ColorKey, WhiteboardEdge["sourceHandle"], WhiteboardEdge["targetHandle"]][] = [
      [0, 0, "yellow", "left", "right"],
      [320, -60, "green", "top", "bottom"],
      [640, 0, "pink", "right", "left"],
      [0, 400, "orange", "left", "right"],
      [320, 480, "purple", "bottom", "top"],
      [640, 400, "yellow", "right", "left"],
    ];
    ideas.forEach(([x, y, color, from, to], i) => {
      const idea = b.sticky(x, y, `Idea ${i + 1}`, color);
      b.connect(topic, idea, [from, to], { routing: "curved", arrow: "none" });
    });
  });

const retrospective = () =>
  build((b) => {
    const columns: [string, ColorKey][] = [
      ["What went well", "green"],
      ["What didn't go well", "pink"],
      ["Action items", "blue"],
    ];
    columns.forEach(([title, color], i) => {
      const x = i * 400;
      b.frame(x, 0, 380, 620, title, color);
      b.sticky(x + 30, 70, "Add a note", color);
      b.sticky(x + 200, 70, "", color);
    });
  });

const swot = () =>
  build((b) => {
    const cells: [string, ColorKey, number, number][] = [
      ["Strengths", "green", 0, 0],
      ["Weaknesses", "orange", 1, 0],
      ["Opportunities", "blue", 0, 1],
      ["Threats", "pink", 1, 1],
    ];
    cells.forEach(([title, color, col, row]) => {
      const x = col * 540;
      const y = row * 420;
      b.frame(x, y, 520, 400, title, color);
      b.sticky(x + 30, y + 70, "", color);
    });
  });

export const WHITEBOARD_TEMPLATES = {
  blank: { name: "Blank", description: "Start from an empty canvas.", build: (): WhiteboardDoc => ({ nodes: [], edges: [] }) },
  flowchart: { name: "Flowchart", description: "Start, steps, a decision and an end, already connected.", build: flowchart },
  swimlanes: { name: "Swimlane process map", description: "A process across three lanes, one per role or team.", build: swimlanes },
  sipoc: { name: "SIPOC", description: "Suppliers, Inputs, Process, Outputs, Customers.", build: sipoc },
  brainstorm: { name: "Brainstorm", description: "A central topic with ideas branching off it.", build: brainstorm },
  retrospective: { name: "Retrospective", description: "Went well, didn't go well, and action items.", build: retrospective },
  swot: { name: "SWOT analysis", description: "Strengths, Weaknesses, Opportunities, Threats.", build: swot },
} as const;

export type WhiteboardTemplateKey = keyof typeof WHITEBOARD_TEMPLATES;
export const WHITEBOARD_TEMPLATE_KEYS = Object.keys(WHITEBOARD_TEMPLATES) as WhiteboardTemplateKey[];
