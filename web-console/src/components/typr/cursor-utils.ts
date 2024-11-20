/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export function getCursorPositionInContentEditable(element: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return -1;

  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer)) return -1;

  let position = range.startOffset;
  let currentNode = range.startContainer;

  // Traverse back through nodes to calculate total offset
  while (currentNode && currentNode !== element) {
    let sibling = currentNode.previousSibling;
    while (sibling) {
      position += sibling.textContent?.length || 0;
      sibling = sibling.previousSibling;
    }
    currentNode = currentNode.parentNode as Node;
  }

  return position;
}

export function setCursorPositionInContentEditable(element: HTMLElement, position: number): void {
  if (position < 0) return;

  const range = document.createRange();
  const selection = window.getSelection();

  if (!selection) return;

  let currentPos = 0;

  function setRangeAtPosition(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
      const textLength = node.textContent?.length || 0;

      if (currentPos + textLength >= position) {
        range.setStart(node, position - currentPos);
        range.collapse(true);
        return true;
      }

      currentPos += textLength;
    } else if (node.nodeType === Node.ELEMENT_NODE && node.childNodes.length > 0) {
      for (const child of node.childNodes) {
        if (setRangeAtPosition(child)) {
          return true;
        }
      }
    }

    return false;
  }

  if (setRangeAtPosition(element)) {
    selection.removeAllRanges();
    selection.addRange(range);
  }
}
