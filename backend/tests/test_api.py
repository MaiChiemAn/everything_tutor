def question_payload():
    return {"content": "What is 2 + 2?", "option_a": "3", "option_b": "4", "option_c": "5", "option_d": "22", "correct_answer": "B", "explanation": "Basic addition."}

def document_text(document):
    if isinstance(document, str): return document
    if not isinstance(document, dict): return ""
    return document.get("text", "") + "".join(document_text(child) for child in document.get("content", []))

def test_register_and_login(client):
    response = client.post("/api/auth/register", json={"email": "new@example.com", "full_name": "New Student", "password": "long-password"})
    assert response.status_code == 201, response.text
    assert response.json()["role"] == "student"
    assert client.post("/api/auth/login", json={"email": "new@example.com", "password": "wrong-password"}).status_code == 401

def test_role_enforcement_and_teacher_question_crud(client, auth_tokens):
    student = {"Authorization": f"Bearer {auth_tokens['student']}"}
    teacher = {"Authorization": f"Bearer {auth_tokens['teacher']}"}
    assert client.post("/api/teacher/questions", json=question_payload(), headers=student).status_code == 403
    created = client.post("/api/teacher/questions", json=question_payload(), headers=teacher)
    assert created.status_code == 201
    question_id = created.json()["id"]
    assert client.get("/api/teacher/questions", headers=teacher).status_code == 200
    changed = question_payload() | {"content": "Updated?"}
    assert document_text(client.put(f"/api/teacher/questions/{question_id}", json=changed, headers=teacher).json()["content"]) == "Updated?"
    assert client.delete(f"/api/teacher/questions/{question_id}", headers=teacher).status_code == 204

def test_quiz_hides_answers_and_scores_on_server(client, auth_tokens):
    teacher = {"Authorization": f"Bearer {auth_tokens['teacher']}"}
    student = {"Authorization": f"Bearer {auth_tokens['student']}"}
    question_id = client.post("/api/teacher/questions", json=question_payload(), headers=teacher).json()["id"]
    available = client.get("/api/quiz/questions", headers=student)
    assert available.status_code == 200 and "correct_answer" not in available.json()[0]
    result = client.post("/api/quiz/submit", json={"answers": [{"question_id": question_id, "selected_answer": "B"}]}, headers=student)
    assert result.status_code == 201
    assert result.json()["score_percent"] == 100 and result.json()["answers"][0]["is_correct"] is True
    assert len(client.get("/api/quiz/history", headers=student).json()) == 1
    assert client.get(f"/api/quiz/attempts/{result.json()['id']}", headers=student).status_code == 200
    assert client.get(f"/api/quiz/attempts/{result.json()['id']}", headers={"Authorization": f"Bearer {auth_tokens['teacher']}"}).status_code == 403

def test_quiz_requires_answer_for_every_available_question(client, auth_tokens):
    teacher = {"Authorization": f"Bearer {auth_tokens['teacher']}"}
    student = {"Authorization": f"Bearer {auth_tokens['student']}"}
    first = client.post("/api/teacher/questions", json=question_payload(), headers=teacher).json()["id"]
    client.post("/api/teacher/questions", json=question_payload() | {"content": "Another question?"}, headers=teacher)
    response = client.post("/api/quiz/submit", json={"answers": [{"question_id": first, "selected_answer": "B"}]}, headers=student)
    assert response.status_code == 422

def test_collection_management_and_collection_quiz(client, auth_tokens):
    teacher = {"Authorization": f"Bearer {auth_tokens['teacher']}"}
    student = {"Authorization": f"Bearer {auth_tokens['student']}"}
    created = client.post("/api/collections", json={"name": "Strings", "description": "Python string basics"}, headers=teacher)
    assert created.status_code == 201
    collection = created.json()
    assert collection["question_count"] == 0 and collection["is_published"] is True
    assert client.post("/api/collections", json={"name": "Denied"}, headers=student).status_code == 403

    question = client.post(f"/api/collections/{collection['id']}/questions", json=question_payload(), headers=teacher)
    assert question.status_code == 201 and question.json()["collection_id"] == collection["id"]
    assert client.get("/api/collections", headers=student).json()[0]["question_count"] == 1
    quiz = client.get(f"/api/collections/{collection['id']}/quiz", headers=student)
    assert quiz.status_code == 200 and "correct_answer" not in quiz.json()[0]

    feedback = client.post("/api/quiz/answer-feedback", json={"collection_id": collection["id"], "question_id": question.json()["id"], "selected_answer": "A"}, headers=student)
    assert feedback.status_code == 200 and feedback.json()["is_correct"] is False
    assert feedback.json()["correct_answer"] == "B" and document_text(feedback.json()["explanation"]) == "Basic addition."
    result = client.post(f"/api/collections/{collection['id']}/submit", json={"answers": [{"question_id": question.json()["id"], "selected_answer": "B"}]}, headers=student)
    assert result.status_code == 201 and result.json()["collection_name"] == "Strings"
    assert result.json()["score_percent"] == 100
    assert client.delete(f"/api/collections/{collection['id']}", headers=teacher).status_code == 409

    updated = client.put(f"/api/collections/{collection['id']}", json={"name": "Strings", "description": "Hidden now", "is_published": False}, headers=teacher)
    assert updated.status_code == 200 and updated.json()["is_published"] is False
    assert all(row["id"] != collection["id"] for row in client.get("/api/collections", headers=student).json())
    assert client.get(f"/api/collections/{collection['id']}/quiz", headers=student).status_code == 404

def test_teacher_can_move_unused_question_between_owned_collections(client, auth_tokens):
    teacher = {"Authorization": f"Bearer {auth_tokens['teacher']}"}
    student = {"Authorization": f"Bearer {auth_tokens['student']}"}
    source = client.post("/api/collections", json={"name": "Source"}, headers=teacher).json()
    target = client.post("/api/collections", json={"name": "Target"}, headers=teacher).json()
    question = client.post(f"/api/collections/{source['id']}/questions", json=question_payload(), headers=teacher).json()
    moved = client.put(f"/api/collections/{target['id']}/questions/{question['id']}", headers=teacher)
    assert moved.status_code == 200 and moved.json()["collection_id"] == target["id"]
    assert client.get(f"/api/collections/{source['id']}/questions", headers=teacher).json() == []

    submitted = client.post(f"/api/collections/{target['id']}/submit", json={"answers": [{"question_id": question["id"], "selected_answer": "B"}]}, headers=student)
    assert submitted.status_code == 201
    assert client.put(f"/api/collections/{source['id']}/questions/{question['id']}", headers=teacher).status_code == 409

def test_rich_text_round_trips_and_is_snapshotted_for_history(client, auth_tokens):
    teacher = {"Authorization": f"Bearer {auth_tokens['teacher']}"}
    student = {"Authorization": f"Bearer {auth_tokens['student']}"}
    collection = client.post("/api/collections", json={"name": "Code examples"}, headers=teacher).json()
    payload = question_payload() | {
        "content": {"type": "doc", "content": [{"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "What prints?"}]}, {"type": "codeBlock", "attrs": {"language": "python"}, "content": [{"type": "text", "text": "print(2 + 2)"}]}]},
        "option_b": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "4", "marks": [{"type": "bold"}]}]}]},
        "explanation": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "The result is four."}]}, {"type": "codeBlock", "attrs": {"language": "python"}, "content": [{"type": "text", "text": "2 + 2"}]}]},
    }
    saved = client.post(f"/api/collections/{collection['id']}/questions", json=payload, headers=teacher)
    assert saved.status_code == 201
    assert saved.json()["content"]["content"][1]["type"] == "codeBlock"
    question_id = saved.json()["id"]
    result = client.post(f"/api/collections/{collection['id']}/submit", json={"answers": [{"question_id": question_id, "selected_answer": "B"}]}, headers=student)
    assert result.status_code == 201 and result.json()["answers"][0]["content"] == saved.json()["content"]
    updated = client.put(f"/api/teacher/questions/{question_id}", json=question_payload() | {"content": "Changed after submission"}, headers=teacher)
    assert updated.status_code == 200
    review = client.get(f"/api/quiz/attempts/{result.json()['id']}", headers=student).json()
    assert review["answers"][0]["content"] == saved.json()["content"]
    assert review["answers"][0]["option_b"] == saved.json()["option_b"]
    assert document_text(review["answers"][0]["explanation"]) == "The result is four.2 + 2"
