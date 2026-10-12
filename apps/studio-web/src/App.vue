<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import CodeEditor from "./components/CodeEditor.vue";
import FileTree from "./components/FileTree.vue";
import PreviewPane from "./components/PreviewPane.vue";
import Problems from "./components/Problems.vue";
import { useStudio } from "./store";

const studio = useStudio();
const editorRef = ref<InstanceType<typeof CodeEditor>>();
const workspace = ref<HTMLElement | null>(null);
const newName = ref("");
const newTemplate = ref("blank");
const showPreview = ref(true);
const rendererChoice = ref("auto");
const split = ref(0.5);

onMounted(() => studio.init());

const columns = computed(() => (showPreview.value
  ? `280px minmax(0, ${split.value}fr) 6px minmax(0, ${1 - split.value}fr)`
  : "280px minmax(0, 1fr)"));

function startDrag(event: MouseEvent): void {
  event.preventDefault();
  const move = (moveEvent: MouseEvent) => {
    const rect = workspace.value?.getBoundingClientRect();
    if (!rect) return;
    const usable = rect.width - 280 - 6;
    if (usable <= 0) return;
    split.value = Math.min(0.8, Math.max(0.2, (moveEvent.clientX - rect.left - 280) / usable));
  };
  const stop = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", stop); };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", stop);
}

function changeRenderer(): void {
  void studio.setRenderer(rendererChoice.value === "auto" ? "" : rendererChoice.value);
}

function onSelectProject(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  if (value) void studio.selectProject(value);
}

async function createProject(): Promise<void> {
  const name = newName.value.trim();
  if (!name) return;
  await studio.createProject(name, newTemplate.value);
  newName.value = "";
}

async function saveAsTemplate(): Promise<void> {
  const name = window.prompt("Template name", studio.activeId);
  if (!name) return;
  try { await studio.saveAsTemplate(name); } catch (error) { studio.fail(error); }
}

async function newFile(): Promise<void> {
  const path = window.prompt("New file path (e.g. slides/intro.rtex)");
  if (path) await studio.createFile(path);
}

async function renameFile(path: string): Promise<void> {
  const target = window.prompt("Rename to", path);
  if (target && target !== path) await studio.renameFile(path, target);
}

async function deleteFile(path: string): Promise<void> {
  if (window.confirm(`Delete ${path}?`)) await studio.deleteFile(path);
}

async function openDiagnostic(payload: { file: string; line: number }): Promise<void> {
  await studio.openFile(payload.file);
  await nextTick();
  editorRef.value?.goTo(payload.line);
}

function onUpload(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (input.files?.length) void studio.uploadFiles(input.files);
}

const statusClass = computed(() => studio.status === "error" || studio.hasErrors ? "bad" : studio.status === "ready" ? "ok" : "busy");
const statusLabel = computed(() => {
  if (studio.status === "error") return "error";
  if (studio.status === "ready") return studio.hasErrors ? "build failed" : "up to date";
  return studio.status;
});
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand"><span class="mark" /><span class="name">Reveal<span>TeX</span> Studio</span></div>

      <div class="field">
        <label>Project</label>
        <select :value="studio.activeId" @change="onSelectProject" :disabled="!studio.projects.length">
          <option value="" disabled>Select…</option>
          <option v-for="project in studio.projects" :key="project.id" :value="project.id">{{ project.name }}</option>
        </select>
      </div>

      <span class="grow" />

      <input v-model="newName" class="standalone" placeholder="New project name" style="width: 150px" @keyup.enter="createProject" />
      <select v-model="newTemplate" style="max-width: 200px">
        <option v-for="template in studio.templates" :key="template.name" :value="template.name">{{ template.label }}</option>
      </select>
      <button class="primary" @click="createProject">New project</button>
      <button :disabled="!studio.activeId" @click="saveAsTemplate">Save as template</button>

      <div class="field">
        <label>Renderer</label>
        <select v-model="rendererChoice" @change="changeRenderer">
          <option value="auto">auto</option>
          <option value="vue">vue</option>
          <option value="html">html</option>
        </select>
      </div>
      <button @click="showPreview = !showPreview">{{ showPreview ? "Hide preview" : "Show preview" }}</button>
      <span class="pill" :class="statusClass">{{ statusLabel }}</span>
    </header>

    <div ref="workspace" class="workspace" :style="{ gridTemplateColumns: columns }">
      <aside class="sidebar">
        <div class="section-head">Projects</div>
        <div class="projects">
          <button
            v-for="project in studio.projects"
            :key="project.id"
            class="project"
            :class="{ active: project.id === studio.activeId }"
            @click="studio.selectProject(project.id)"
          >
            <span class="grow">{{ project.name }}</span>
            <span class="del" title="Delete project" @click.stop="studio.deleteProject(project.id)">✕</span>
          </button>
          <p v-if="!studio.projects.length" style="padding: 0 6px; color: #5b6478;">No projects yet.</p>
        </div>

        <div class="section-head">
          <span class="grow">Explorer</span>
          <button class="ghost" :disabled="!studio.activeId" title="New file" @click="newFile">+ File</button>
          <label class="ghost" style="cursor: pointer; padding: 4px 8px;">
            Upload
            <input type="file" multiple style="display: none" @change="onUpload" />
          </label>
        </div>
        <div class="tree-wrap">
          <FileTree :tree="studio.tree" :active="studio.activePath" @open="studio.openFile" @rename="renameFile" @delete="deleteFile" />
        </div>
      </aside>

      <section class="editor">
        <div class="tabs">
          <div
            v-for="file in studio.openFiles"
            :key="file.path"
            class="tab"
            :class="{ active: file.path === studio.activePath }"
            @click="studio.activePath = file.path"
          >
            <span v-if="file.dirty" class="dot" />
            <span>{{ file.path.split('/').pop() }}</span>
            <span class="close" @click.stop="studio.closeFile(file.path)">×</span>
          </div>
        </div>
        <CodeEditor v-if="studio.activeFile" ref="editorRef" :file="studio.activeFile" @update="studio.updateContent" @save="studio.saveActive" />
        <div v-else class="editor-empty">
          <h2>No file open</h2>
          <p>Select a file from the explorer to start editing.</p>
        </div>
        <Problems :diagnostics="studio.diagnostics" @open="openDiagnostic" />
      </section>

      <template v-if="showPreview">
        <div class="splitter" @mousedown="startDrag" />
        <PreviewPane :url="studio.previewUrl" :kind="studio.previewKind" :revision="studio.revision" />
      </template>
    </div>

    <div v-if="studio.error" class="error-toast" @click="studio.clearError()">{{ studio.error }} — click to dismiss</div>
  </div>
</template>
