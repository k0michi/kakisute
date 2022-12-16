import { Observable } from "kyoka";
import produce from 'immer';
import { v4 as uuidv4 } from 'uuid';
import Timestamp from "./timestamp";
import { arrayInsertBefore, arrayRemove, round } from "./utils";
import { Version5 } from "./compat";
import { visit } from "./tree";
import { AnchorNode, DirectoryNode, File, ImageNode, MathNode, Node, NodeType, ReservedID, Tag, TextEmbedNode, TextNode } from "./node";
import Model from "./model";
import EventHandler from "./event-handler";

export const LIBRARY_VERSION = 6;

export interface Library {
  nodes: Node[];
  files: File[];
  tags: Tag[];
  version: number;
}

export default class LibraryModel {
  nodes = new Observable<Node[]>([]); // mutable
  files = new Observable<File[]>([]); // mutable
  tags = new Observable<Tag[]>([]); // mutable
  nodeMap = new Map<string, Node>();
  saveHandler = new EventHandler();

  constructor() {
    this.initialize({
      nodes: LibraryModel.blankNodes(),
      files: [],
      tags: [],
      version: LIBRARY_VERSION
    });
  }

  initializeFromJSON(json: string) {
    let data = JSON.parse(json, (key, value) => {
      if (key == 'created' || key == 'modified' || key == 'accessed' || key == 'contentModified' || key == 'contentAccessed') {
        return new Timestamp(value);
      }

      return value;
    }) as Library;

    // validateLibrary(data);

    // Migrate older format
    if (data.version == 5) {
      data = Version5.convert(data);
    }

    this.initialize(data);
  }

  toJSON() {
    const data = {
      nodes: this.nodes.get(),
      files: this.files.get(),
      tags: this.tags.get(),
      version: LIBRARY_VERSION
    };

    return JSON.stringify(data, (key, value) => {
      if (key == 'index' || key == 'parent' || key == 'depth') {
        return undefined;
      }

      return value;
    });
  }

  initialize(data: Library) {
    // Initialize parent
    for (const n of data.nodes) {
      LibraryModel.assignParent(n);
    }

    // Initialize nodeMap
    this.initializeNodeMap(data.nodes);

    // Initialize index
    let index = 0;

    for (const n of data.nodes) {
      index = LibraryModel.assignIndex(n, index);
    }

    // Initialize depth
    for (const n of data.nodes) {
      LibraryModel.assignDepth(n);
    }

    // Set members
    this.nodes.set(data.nodes ?? []);
    this.files.set(data.files ?? []);
    this.tags.set(data.tags ?? []);
  }


  // Handler

  save() {
    this.saveHandler.emit();
  }


  // Nodes

  static blankNodes() {
    return [
      {
        type: NodeType.Directory,
        id: ReservedID.Master,
        children: [] as Node[]
      } as DirectoryNode,
      {
        type: NodeType.Directory,
        id: ReservedID.Trash,
        children: [] as Node[]
      } as DirectoryNode
    ];
  }

  addNode(parent: Node | string, node: Node) {
    parent = this.getNodeIfNeeded(parent);

    /*
    // Set parent
    node.parent = parent;

    const prevNode = Model.getLastNodeOf(parent);
    const prevIndex = prevNode.index!;

    // Set index
    node.index = prevIndex + 1;

    for (const node of visit(this.nodes.get())) {
      if (node.index! > prevIndex) {
        node.index!++;
      }
    }

    // Set depth
    node.depth = parent.depth! + 1;
    */

    // Put on map
    this.nodeMap.set(node.id, node);

    parent.children.push(node);

    // Stable, but not efficient
    this.recalculateParent();
    this.recalculateIndex();
    this.recalculateDepth();

    this.nodes.set(this.nodes.get()); // Explicitly update
    this.save();
  }

  addTextNode(text: string, timeStamp: Timestamp, parent: Node | string, tags?: string[]) {
    const id = uuidv4();

    if (tags?.length == 0) {
      tags = undefined;
    }

    const node: TextNode = {
      type: NodeType.Text,
      content: text,
      tags,
      created: timeStamp,
      modified: timeStamp,
      id,
      children: []
    };

    this.addNode(parent, node);
    return node;
  }

  addImageNode(file: File, timeStamp: Timestamp, parent: Node | string, tags?: string[]) {
    const id = uuidv4()

    if (tags?.length == 0) {
      tags = undefined;
    }

    const node: ImageNode = {
      type: NodeType.Image,
      fileID: file.id,
      tags,
      created: timeStamp,
      modified: timeStamp,
      id,
      children: []
    };

    this.addFile(file);
    this.addNode(parent, node);
    return node;
  }

  addTextEmbedNode(file: File, timeStamp: Timestamp, parent: Node | string, tags?: string[]) {
    const id = uuidv4()

    if (tags?.length == 0) {
      tags = undefined;
    }

    const node: TextEmbedNode = {
      type: NodeType.TextEmbed,
      fileID: file.id,
      tags,
      created: timeStamp,
      modified: timeStamp,
      id,
      children: []
    };

    this.addFile(file);
    this.addNode(parent, node);
    return node;
  }

  addDirectoryNode(name: string, timeStamp: Timestamp, parent: Node | string, tags?: string[]) {
    const id = uuidv4()

    if (tags?.length == 0) {
      tags = undefined;
    }

    const node: DirectoryNode = {
      type: NodeType.Directory,
      name: name,
      tags,
      created: timeStamp,
      modified: timeStamp,
      id,
      children: []
    };

    this.addNode(parent, node);
    return node;
  }

  addAnchorNode(anchor: {
    contentURL: string,
    contentType: string,
    contentTitle?: string,
    contentDescription?: string,
    contentImageFileID?: string,
    contentModified?: Timestamp,
    contentAccessed: Timestamp
  },
    timeStamp: Timestamp,
    parent: Node | string,
    tags?: string[]) {
    const id = uuidv4();

    if (tags?.length == 0) {
      tags = undefined;
    }

    const node: AnchorNode = {
      type: NodeType.Anchor,
      ...anchor,
      created: timeStamp,
      modified: timeStamp,
      id,
      children: []
    };

    this.addNode(parent, node);
    return node;
  }

  addMathNode(exp: string, timeStamp: Timestamp, parent: Node | string, tags?: string[]) {
    const id = uuidv4()

    if (tags?.length == 0) {
      tags = undefined;
    }

    const node: MathNode = {
      type: NodeType.Math,
      expression: exp,
      tags,
      created: timeStamp,
      modified: timeStamp,
      id,
      children: []
    };

    this.addNode(parent, node);
    return node;
  }

  removeNode(node: Node | string) {
    if (typeof node == 'string') {
      const n = this.getNode(node);

      if (n == undefined) {
        throw new Error();
      }

      node = n;
    }

    if (node.type == NodeType.Image) {
      this.removeFile((node as ImageNode).fileID);
    }

    if (node.type == NodeType.Anchor) {
      const fileID = (node as AnchorNode).contentImageFileID;

      if (fileID != null) {
        this.removeFile(fileID);
      }
    }

    arrayRemove(node.parent!.children, node.parent!.children.indexOf(node));

    /*
    // Update index
    for (const n of visit(this.nodes.get())) {
      if (n.index! > node.index!) {
        n.index!--;
      }
    }
    */

    // Delete from map
    this.nodeMap.delete(node.id);

    this.nodes.set(this.nodes.get());

    this.recalculateParent();
    this.recalculateIndex();
    this.recalculateDepth();

    this.save();
  }

  getNode(id: string) {
    const node = this.nodeMap.get(id);

    if (node == undefined) {
      throw new Error(`Node ${id} not found`);
    }

    return node;
  }

  getNodeIfNeeded(node: string | Node) {
    if (typeof node == 'string') {
      return this.getNode(node);
    }

    return node;
  }

  // Deprecated
  getChildNodes(parentID: string) {
    return this.nodeMap.get(parentID)?.children;
  }

  // Deprecated
  getChildDirectories(parentID: string) {
    return this.nodeMap.get(parentID)?.children.filter(n => n.type == NodeType.Directory);
  }

  canMoveNode(node: string | Node, parent: string | Node) {
    node = this.getNodeIfNeeded(node);
    parent = this.getNodeIfNeeded(parent);

    return node != parent && !this.isDescendantOf(parent, node);
  }

  moveNodeBefore(node: string | Node, parent: string | Node, reference: string | Node | undefined = undefined) {
    node = this.getNodeIfNeeded(node);
    parent = this.getNodeIfNeeded(parent);
    reference = reference != undefined ? this.getNodeIfNeeded(reference) : undefined;

    if (node == parent) {
      throw new Error("Node cannot be moved into itself");
    }

    if (this.isDescendantOf(parent.id, node.id)) {
      throw new Error("Node cannot be moved into it's descendant");
    }

    if (reference != undefined && reference.parent != parent) {
      throw new Error("Reference node is invalid");
    }

    if (node.type == NodeType.Directory) {
      if (this.findDirectory(parent, (node as DirectoryNode).name!) != undefined) {
        throw new Error(`Directory ${(node as DirectoryNode).name} already exists`);
      }
    }

    arrayRemove(node.parent!.children, node.parent!.children.indexOf(node));

    /*
    // Set parent
    node.parent = newParent;

    // Set index
    const currentIndex = node.index!;
    let newIndex;

    if (referenceNode != undefined) {
      newIndex = referenceNode.index!;
    } else {
      newIndex = Model.getLastNodeOf(newParent).index! + 1;
    }

    if (currentIndex == newIndex) {
      return;
    }
    
    if (currentIndex < newIndex) {
      newIndex--;
    }

    node.index = newIndex;

    for (const node of visit(this.nodes.get())) {
      if (node.index! > currentIndex && node.index! <= newIndex) {
        node.index!--;
      }else if (node.index! >= newIndex && node.index! < currentIndex) {
        node.index!++;
      }
    }

    // Set depth
    node.depth = newParent.depth! + 1;
    */

    arrayInsertBefore(parent.children, node, reference != undefined ?
      parent.children.indexOf(reference) :
      -1
    );

    this.nodes.set(this.nodes.get());

    this.recalculateParent();
    this.recalculateIndex();
    this.recalculateDepth();

    this.save();
  }

  getReservedDirName(id: string) {
    if (id == ReservedID.Master) {
      return '/';
    }

    if (id == ReservedID.Trash) {
      return 'Trash';
    }

    return undefined;
  }

  getPath(directoryID: string): string {
    const reservedDirName = this.getReservedDirName(directoryID);

    if (reservedDirName != undefined) {
      return reservedDirName;
    }
    const node = this.getNode(directoryID);
    return this.getPath(node.parent?.id!) + (node as DirectoryNode).name + '/';
  }

  swapIndex(node1: string | Node, node2: string | Node) {
    node1 = this.getNodeIfNeeded(node1);
    node2 = this.getNodeIfNeeded(node2);

    console.log(node1, node2)

    const node1Next = this.nextSiblingNode(node1);

    if (node1Next != node2) {
      console.log('node1Next != node2')
      this.moveNodeBefore(node1, node2.parent!, node2);
      this.moveNodeBefore(node2, node1Next?.parent!, node1Next?.id!);
    } else {
      console.log('node1Next == node2')
      this.moveNodeBefore(node2, node1.parent!, node1);
    }
  }

  nextSiblingNode(id: string | Node) {
    const node = this.getNodeIfNeeded(id);
    const index = node.parent!.children.indexOf(node);

    if (index == node.parent!.children.length - 1) {
      return undefined;
    }

    return node.parent!.children[index + 1];
  }

  prevSiblingNode(id: string | Node) {
    const node = this.getNodeIfNeeded(id);
    const index = node.parent!.children.indexOf(node);

    if (index == 0) {
      return undefined;
    }

    return node.parent!.children[index - 1];
  }

  static getLastNodeOf(node: Node): Node {
    if (node.children.length == 0) {
      return node;
    }

    return this.getLastNodeOf(node.children.at(-1)!);
  }


  // Files

  addFile(file: File) {
    this.files.get().push(file);

    this.files.set(this.files.get());
  }

  removeFile(fileID: string) {
    const found = this.files.get().findIndex(f => f.id == fileID);
    bridge.removeFile(this.files.get()[found].id);

    const files = this.files.get();
    files.splice(files.findIndex(f => f.id == fileID), 1);

    this.files.set(this.files.get());
    this.save();
  }

  getFile(fileID: string) {
    const found = this.files.get().find(f => f.id == fileID);
    return found;
  }


  // Tags

  createTag(name: string) {
    const id = uuidv4();

    this.tags.get().push({ id, name });

    this.tags.set(this.tags.get());
    this.save();
    return id;
  }

  findTag(name: string) {
    return this.tags.get().find(t => t.name.localeCompare(name, undefined, { sensitivity: 'accent' }) == 0);
  }

  getTag(id: string) {
    return this.tags.get().find(t => t.id == id);
  }

  appendTag(id: string, tagID: string) {
    const node = this.getNode(id);

    if (node.tags == undefined) {
      node.tags = [tagID];
    } else {
      if (!node.tags.includes(tagID)) {
        node.tags.push(tagID);
      }
    }

    this.nodes.set(this.nodes.get());
    this.save();
  }

  removeTag(id: string) {
    // TODO
  }


  // Directories

  findDirectory(parent: string | Node, name: string) {
    return this.getNodeIfNeeded(parent).children.find(n =>
      n.type == NodeType.Directory &&
      (n as DirectoryNode).name?.localeCompare(name, undefined, { sensitivity: 'accent' }) == 0
    );
  }

  async createDirectory(path: string) {
    const dirs = path.split('/').filter(d => d.length > 0);
    let parentID: string = ReservedID.Master;

    for (const dir of dirs) {
      const found = this.findDirectory(parentID, dir);

      if (found == null) {
        parentID = this.addDirectoryNode(dir, Timestamp.fromNs(await bridge.now()), this.getNode(parentID) as DirectoryNode).id;
      } else {
        parentID = found.id;
      }
    }

    return parentID;
  }

  // Returns true if target is a descendant of parent
  isDescendantOf(target: string | Node, parent: string | Node) {
    target = this.getNodeIfNeeded(target);
    parent = this.getNodeIfNeeded(parent);

    let d: Node | undefined = this.getNodeIfNeeded(target);

    while (d != undefined) {
      d = d.parent;

      if (d == parent) {
        return true;
      }
    }

    return false;
  }


  // Memoization

  static assignIndex(node: Node, base = 0) {
    node.index = base;
    base++;

    for (const child of node.children) {
      base = LibraryModel.assignIndex(child, base);
    }

    return base;
  }

  static assignDepth(node: Node, depth = 0) {
    node.depth = depth;

    for (const child of node.children) {
      LibraryModel.assignDepth(child, depth + 1);
    }
  }

  static assignParent(node: Node) {
    for (const child of node.children) {
      child.parent = node;
      LibraryModel.assignParent(child);
    }
  }

  recalculateParent() {
    for (const n of this.nodes.get()) {
      LibraryModel.assignParent(n);
    }
  }

  recalculateIndex() {
    let index = 0;

    for (const n of this.nodes.get()) {
      index = LibraryModel.assignIndex(n, index);
    }
  }

  recalculateDepth() {
    for (const n of this.nodes.get()) {
      LibraryModel.assignDepth(n);
    }
  }

  initializeNodeMap(nodes: Node[]) {
    this.nodeMap.clear();

    for (const n of visit(nodes)) {
      this.nodeMap.set(n.id, n);
    }
  }
}