import { _decorator, BoxCollider, Component, instantiate, Material, MeshRenderer, Node, Prefab, Vec3 } from 'cc';
import { HexStack } from './HexStack';
import { HexSpawnData } from '../data/LevelData';
const { ccclass, property } = _decorator;

@ccclass('GridCellFactory')
export class GridCellFactory {
    private stackPrefab: Prefab | null = null;

    constructor(stackPrefab: Prefab) {
        this.stackPrefab = stackPrefab;
    }

    /**
    * Creates a new Stack Node.
    */
    public createStack(): Node {
        if (!this.stackPrefab) {
            return new Node("EmptyStack");
        }
        return instantiate(this.stackPrefab);
    }

    /**
    * Creates a new Stack Node and configures its data and material 
    * based on the level JSON (Data-Driven + Factory Pattern).
    */
    public createConfiguredStack(data: HexSpawnData, materials: Material[]): Node {
        const stackNode = this.createStack();
        const hexStack = stackNode.getComponent(HexStack);

        if (hexStack) {
            hexStack.colorId = data.colorId;
            hexStack.tileCount = data.tileCount;
            hexStack.syncVisualTiles();
        }

        // Apply manual offset AFTER syncVisualTiles (which calculates and resets center based on tile bounds)
        const collider = stackNode.getComponent(BoxCollider);
        if (collider) {
            collider.center = new Vec3(0, -0.08, 0);
        }

        // Apply the material (Flyweight Pattern)
        // stackNode.children[0]
        stackNode.children.forEach(child => {
            const meshRenderer = child.getComponentInChildren(MeshRenderer);
            if (meshRenderer && materials && materials[data.colorId]) {
                meshRenderer.setSharedMaterial(materials[data.colorId], 0);
            }
        });

        return stackNode;
    }
}


