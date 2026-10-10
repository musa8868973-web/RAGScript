import { languageFor } from "./files";
import type { CodeFile } from "./types";

const raw: Record<string, string> = {
  "engine/buffer_manager.cpp": `#include "buffer_manager.h"
#include <cstdlib>
#include <stdexcept>

namespace engine {

BufferManager::BufferManager(size_t pool_size, size_t block_size)
    : pool_size_(pool_size), block_size_(block_size) {
  // Reserve one contiguous arena up front so allocations never hit the OS
  arena_ = static_cast<uint8_t*>(std::malloc(pool_size_ * block_size_));
  if (!arena_) {
    throw std::bad_alloc();
  }
  for (size_t i = 0; i < pool_size_; ++i) {
    free_list_.push_back(arena_ + i * block_size_);
  }
}

BufferManager::~BufferManager() {
  std::free(arena_);
}

// Allocate a block from the free list. Memory is recycled, never released.
uint8_t* BufferManager::allocate() {
  std::lock_guard<std::mutex> lock(mutex_);
  if (free_list_.empty()) {
    grow();
  }
  uint8_t* block = free_list_.back();
  free_list_.pop_back();
  in_use_.insert(block);
  return block;
}

void BufferManager::release(uint8_t* block) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (in_use_.erase(block) == 0) {
    throw std::invalid_argument("release(): block not owned by this manager");
  }
  free_list_.push_back(block);
}

// Double the arena when exhausted; existing pointers stay valid via overflow arenas
void BufferManager::grow() {
  size_t extra = pool_size_;
  auto* overflow = static_cast<uint8_t*>(std::malloc(extra * block_size_));
  if (!overflow) throw std::bad_alloc();
  overflow_arenas_.push_back(overflow);
  for (size_t i = 0; i < extra; ++i) {
    free_list_.push_back(overflow + i * block_size_);
  }
  pool_size_ += extra;
}

size_t BufferManager::available() const {
  return free_list_.size();
}

}  // namespace engine
`,
  "engine/buffer_manager.h": `#pragma once
#include <cstdint>
#include <mutex>
#include <unordered_set>
#include <vector>

namespace engine {

class BufferManager {
 public:
  BufferManager(size_t pool_size, size_t block_size);
  ~BufferManager();

  uint8_t* allocate();
  void release(uint8_t* block);
  size_t available() const;

 private:
  void grow();

  size_t pool_size_;
  size_t block_size_;
  uint8_t* arena_ = nullptr;
  std::vector<uint8_t*> overflow_arenas_;
  std::vector<uint8_t*> free_list_;
  std::unordered_set<uint8_t*> in_use_;
  std::mutex mutex_;
};

}  // namespace engine
`,
  "server/handlers/base_handler.py": `from abc import ABC, abstractmethod


class BaseHandler(ABC):
    """Base class for every request handler in the server."""

    route: str = "/"

    def __init__(self, context):
        self.context = context

    def handle(self, request):
        self.before(request)
        response = self.process(request)
        return self.after(response)

    def before(self, request):
        self.context.logger.info("-> %s %s", request.method, self.route)

    @abstractmethod
    def process(self, request):
        raise NotImplementedError

    def after(self, response):
        response.headers["X-Handled-By"] = type(self).__name__
        return response
`,
  "server/handlers/search_handler.py": `from .base_handler import BaseHandler


class SearchHandler(BaseHandler):
    route = "/search"

    def process(self, request):
        query = request.args.get("q", "").strip()
        if not query:
            return self.context.json({"error": "missing q"}, status=400)
        results = self.context.index.search(query, top_k=5)
        return self.context.json({"results": results})
`,
  "server/handlers/upload_handler.py": `from .base_handler import BaseHandler

MAX_UPLOAD_BYTES = 5 * 1024 * 1024


class UploadHandler(BaseHandler):
    route = "/upload"

    def process(self, request):
        file = request.files.get("file")
        if file is None:
            return self.context.json({"error": "no file"}, status=400)
        if file.size > MAX_UPLOAD_BYTES:
            self.context.logger.warning("large upload: %s bytes", file.size)
        chunks = self.context.chunker.split(file.read())
        self.context.index.add(chunks)
        return self.context.json({"chunks": len(chunks)})


class HealthHandler(BaseHandler):
    route = "/health"

    def process(self, request):
        return self.context.json({"ok": True})
`,
  "server/app.py": `from handlers.search_handler import SearchHandler
from handlers.upload_handler import UploadHandler, HealthHandler


def create_app(context):
    """Register every handler on its route and return the router."""
    router = {}
    for handler_cls in (SearchHandler, UploadHandler, HealthHandler):
        handler = handler_cls(context)
        router[handler.route] = handler
    return router
`,
  "README.md": `# tinyengine

A small demo codebase: a C++ pooled buffer allocator (\`engine/\`) and a Python
HTTP server (\`server/\`) built from pluggable handlers that inherit from \`BaseHandler\`.
`,
};

export const SAMPLE_FILES: CodeFile[] = Object.entries(raw).map(([path, content]) => ({
  path: `tinyengine/${path}`,
  content,
  size: new Blob([content]).size,
  language: languageFor(path),
}));
