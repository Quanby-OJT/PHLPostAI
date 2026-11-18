"client"

import React, { useState, useEffect, useRef } from "react"

interface Message {
  sender: "customer" | "assistant"
  content: string
}

export default function AssistantPage() {
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputQuery, setInputQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Initialize customer session on mount
  useEffect(() => {
    async function initSession() {
      try {
        const res = await fetch("/v1/customer/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ channelCode: "web-widget", language: "en" }),
        })
        const data = await res.json()
        if (data.sessionToken) {
          setSessionToken(data.sessionToken)
          localStorage.setItem("customer_session_token", data.sessionToken)
        }
      } catch (err) {
        console.error("Failed to initialize customer session", err)
      }
    }

    const cachedToken = localStorage.getItem("customer_session_token")
    if (cachedToken) {
      setSessionToken(cachedToken)
    } else {
      initSession()
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputQuery.trim() || !sessionToken || loading) return

    const userQuery = inputQuery.trim()
    setInputQuery("")
    setMessages((prev) => [...prev, { sender: "customer", content: userQuery }])
    setLoading(true)

    try {
      const res = await fetch("/v1/customer/chat/stream", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-customer-session": sessionToken,
        },
        body: JSON.stringify({ query: userQuery, k: 3 }),
      })

      if (!res.ok) {
        throw new Error("Stream request failed")
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let assistantResponse = ""

      setMessages((prev) => [...prev, { sender: "assistant", content: "" }])

      if (reader) {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          assistantResponse += chunk

          setMessages((prev) => {
            const updated = [...prev]
            updated[updated.length - 1] = { sender: "assistant", content: assistantResponse }
            return updated
          })
        }
      }
    } catch (err) {
      console.error("Error streaming chat response:", err)
      setMessages((prev) => [
        ...prev,
        { sender: "assistant", content: "Sorry, something went wrong while processing your request." },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto p-4 bg-gray-50">
      <header className="py-4 border-b mb-4 text-center">
        <h1 className="text-xl font-bold text-gray-800">PHLPost Assistant Support</h1>
        <p className="text-sm text-gray-500">Channel: Web Widget | Language: English</p>
      </header>

      <div className="flex-1 overflow-y-auto space-y-4 p-4 bg-white rounded-lg shadow-sm border">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 mt-20">
            <p>How can we help you today?</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.sender === "customer" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-md px-4 py-2 rounded-lg text-sm ${
                  msg.sender === "customer"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-800 border"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSendMessage} className="mt-4 flex gap-2">
        <input
          type="text"
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          placeholder="Ask a question about tracking, rates, or services..."
          className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        <button
          type="submit"
          className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          disabled={loading || !inputQuery.trim()}
        >
          Send
        </button>
      </form>
    </div>
  )
}