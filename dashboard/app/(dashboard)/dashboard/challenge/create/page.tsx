"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PlusCircle, MinusCircle } from "lucide-react";

interface Question {
  content: string;
  type: string;
  points: number;
  orderIndex: number;
  answer?: string;
  options?: string[];
}

interface AppConfig {
  id: string;
  title: string;
  icon: string;
  disabled: boolean;
  favourite: boolean;
  desktopShortcut: boolean;
  screen: string;
  width: number;
  height: number;
  disableScrolling?: boolean;
  url?: string;
  description?: string;
  launchOnStartup: boolean;
}

interface ChallengeType {
  id: string;
  name: string;
  DefaultAppsConfig?: AppConfig[];
}

const defaultApps = [
  {
    id: "chrome",
    title: "Browser",
    icon: "./icons/browser.svg",
    disabled: false,
    favourite: true,
    desktopShortcut: true,
    screen: "displayChrome",
    width: 70,
    height: 80,
    launchOnStartup: false,
  },
  {
    id: "terminal",
    title: "Terminal",
    icon: "./icons/Remote-Terminal.svg",
    disabled: false,
    favourite: true,
    desktopShortcut: false,
    screen: "displayTerminal",
    width: 60,
    height: 55,
    disableScrolling: true,
    launchOnStartup: true,
  },
  {
    id: "codeeditor",
    title: "Code Editor",
    icon: "./icons/code-editor.svg",
    disabled: false,
    favourite: true,
    desktopShortcut: false,
    screen: "displayCodeEditor",
    width: 60,
    height: 75,
    launchOnStartup: false,
  },
  {
    id: "cyberchef",
    title: "Cyber Chef",
    icon: "./icons/cyberchef.svg",
    disabled: false,
    favourite: true,
    desktopShortcut: true,
    screen: "Cyberchef",
    width: 75,
    height: 85,
    launchOnStartup: false,
  },
  {
    id: "web_chal",
    title: "Web Challenge",
    icon: "./icons/browser.svg",
    disabled: false,
    favourite: true,
    desktopShortcut: true,
    screen: "displayWebChal",
    width: 70,
    height: 80,
    launchOnStartup: false,
  },
  {
    id: "challenge_prompt",
    title: "Challenge Prompt",
    icon: "./icons/prompt.svg",
    disabled: false,
    favourite: true,
    desktopShortcut: true,
    screen: "displayChallengePrompt",
    width: 70,
    height: 80,
    description: "Default description for the challenge prompt",
    launchOnStartup: true,
  }
];

export default function CreateChallengePage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [challengeTypes, setChallengeTypes] = useState<ChallengeType[]>([]);
  const [apps, setApps] = useState<AppConfig[]>(defaultApps.map(app => ({ ...app })));

  useEffect(() => {
    // Fetch challenge types from the database
    const fetchChallengeTypes = async () => {
      try {
        const response = await fetch("/api/challenge-types");
        if (!response.ok) throw new Error("Failed to fetch challenge types");
        const data = await response.json();
        setChallengeTypes(data);
      } catch (error) {
        console.error("Error fetching challenge types:", error);
        toast({
          title: "Error",
          description: "Failed to fetch challenge types",
          variant: "destructive",
        });
      }
    };

    fetchChallengeTypes();
  }, [toast]);

  // Add new useEffect to handle type changes
  useEffect(() => {
    if (type) {
      const selectedType = challengeTypes.find(ct => ct.id === type);
      if (selectedType?.DefaultAppsConfig) {
        setApps(selectedType.DefaultAppsConfig.map(app => ({ ...app })));
      } else {
        setApps(defaultApps.map(app => ({ ...app })));
      }
    }
  }, [type, challengeTypes]);

  const addQuestion = () => {
    setQuestions([
      ...questions,
      {
        content: "",
        type: "text",
        points: 0,
        orderIndex: questions.length,
        answer: "",
        options: []
      },
    ]);
  };

  const addOption = (questionIndex: number) => {
    const updatedQuestions = [...questions];
    if (!updatedQuestions[questionIndex].options) {
      updatedQuestions[questionIndex].options = [];
    }
    updatedQuestions[questionIndex].options?.push("");
    setQuestions(updatedQuestions);
  };

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    const updatedQuestions = [...questions];
    if (updatedQuestions[questionIndex].options) {
      updatedQuestions[questionIndex].options![optionIndex] = value;
      setQuestions(updatedQuestions);
    }
  };

  const removeOption = (questionIndex: number, optionIndex: number) => {
    const updatedQuestions = [...questions];
    if (updatedQuestions[questionIndex].options) {
      updatedQuestions[questionIndex].options = updatedQuestions[questionIndex].options!.filter((_, i) => i !== optionIndex);
      setQuestions(updatedQuestions);
    }
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const updateQuestion = (index: number, field: keyof Question, value: string | number) => {
    const updatedQuestions = [...questions];
    if (field === "points") {
      // Ensure points is always a valid number
      const points = parseInt(value.toString());
      updatedQuestions[index] = {
        ...updatedQuestions[index],
        [field]: isNaN(points) ? 0 : points,
      };
    } else {
      updatedQuestions[index] = {
        ...updatedQuestions[index],
        [field]: value,
      };
    }
    setQuestions(updatedQuestions);
  };

  const updateAppConfig = (index: number, field: keyof AppConfig, value: any) => {
    const updatedApps = [...apps];
    updatedApps[index] = {
      ...updatedApps[index],
      [field]: value,
    };
    setApps(updatedApps);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const enabledApps = apps.filter(app => !app.disabled);
      const response = await fetch("/api/challenges", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description,
          type,
          difficulty,
          questions,
          appConfig: enabledApps,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create challenge");
      }

      toast({
        title: "Success",
        description: "Challenge created successfully",
      });

      router.push("/dashboard/challenge");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create challenge",
        variant: "destructive",
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 px-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Create New Challenge</h2>
        <Button type="submit">Create Challenge</Button>
      </div>

      <Tabs defaultValue="basic" className="w-full">
        <TabsList>
          <TabsTrigger value="basic">Basic Info</TabsTrigger>
          <TabsTrigger value="questions">Questions</TabsTrigger>
          <TabsTrigger value="appConfig">App Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="space-y-4">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Challenge Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="type">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {challengeTypes.map((challengeType) => (
                    <SelectItem key={challengeType.id} value={challengeType.id}>
                      {challengeType.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="difficulty">Difficulty</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger>
                  <SelectValue placeholder="Select difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                  <SelectItem value="expert">Expert</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="questions" className="space-y-4">
          <ScrollArea className="h-[600px] pr-4">
            <div className="space-y-4">
              {questions.map((question, index) => (
                <Card key={index}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      Question {index + 1}
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeQuestion(index)}
                    >
                      <MinusCircle className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-2">
                      <Label>Question Content</Label>
                      <Textarea
                        value={question.content}
                        onChange={(e) =>
                          updateQuestion(index, "content", e.target.value)
                        }
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>Type</Label>
                        <Select
                          value={question.type}
                          onValueChange={(value) =>
                            updateQuestion(index, "type", value)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="flag">Flag</SelectItem>
                            <SelectItem value="multiple">Multiple Choice</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label>Points</Label>
                        <Input
                          type="number"
                          value={question.points || 0}
                          onChange={(e) =>
                            updateQuestion(index, "points", e.target.value)
                          }
                          required
                          min={0}
                        />
                      </div>
                    </div>

                    {question.type === "text" && (
                      <div className="grid gap-2">
                        <Label>Correct Answer</Label>
                        <Input
                          value={question.answer || ""}
                          onChange={(e) =>
                            updateQuestion(index, "answer", e.target.value)
                          }
                          required
                        />
                      </div>
                    )}

                    {question.type === "multiple" && (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <Label>Options</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => addOption(index)}
                          >
                            <PlusCircle className="h-4 w-4 mr-2" />
                            Add Option
                          </Button>
                        </div>
                        {question.options?.map((option, optionIndex) => (
                          <div key={optionIndex} className="flex gap-2 items-center">
                            <Input
                              value={option}
                              onChange={(e) =>
                                updateOption(index, optionIndex, e.target.value)
                              }
                              placeholder={`Option ${optionIndex + 1}`}
                              required
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeOption(index, optionIndex)}
                            >
                              <MinusCircle className="h-4 w-4" />
                            </Button>
                            <div className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`correct-answer-${index}`}
                                checked={question.answer === option}
                                onChange={() => updateQuestion(index, "answer", option)}
                                required
                              />
                              <Label>Correct</Label>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={addQuestion}
              >
                <PlusCircle className="h-4 w-4 mr-2" />
                Add Question
              </Button>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="appConfig" className="space-y-4">
          <ScrollArea className="h-[600px] pr-4">
            <div className="space-y-4">
              {apps.map((app, index) => (
                <Card key={app.id}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      {app.title}
                    </CardTitle>
                    <div className="flex items-center space-x-2">
                      <Label htmlFor={`enabled-${app.id}`}>Enabled</Label>
                      <Switch
                        id={`enabled-${app.id}`}
                        checked={!app.disabled}
                        onCheckedChange={(checked) =>
                          updateAppConfig(index, "disabled", !checked)
                        }
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!app.disabled && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label>Width (%)</Label>
                            <Input
                              type="number"
                              value={app.width}
                              onChange={(e) =>
                                updateAppConfig(index, "width", parseInt(e.target.value))
                              }
                              min={0}
                              max={100}
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label>Height (%)</Label>
                            <Input
                              type="number"
                              value={app.height}
                              onChange={(e) =>
                                updateAppConfig(index, "height", parseInt(e.target.value))
                              }
                              min={0}
                              max={100}
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <Label>Show in Dock</Label>
                          <Switch
                            checked={app.favourite}
                            onCheckedChange={(checked) =>
                              updateAppConfig(index, "favourite", checked)
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label>Desktop Shortcut</Label>
                          <Switch
                            checked={app.desktopShortcut}
                            onCheckedChange={(checked) =>
                              updateAppConfig(index, "desktopShortcut", checked)
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label>Launch on Startup</Label>
                          <Switch
                            checked={app.launchOnStartup}
                            onCheckedChange={(checked) =>
                              updateAppConfig(index, "launchOnStartup", checked)
                            }
                          />
                        </div>
                        {app.id === "web_chal" && (
                          <div className="grid gap-2">
                            <Label>URL</Label>
                            <Input
                              value={app.url || ""}
                              onChange={(e) =>
                                updateAppConfig(index, "url", e.target.value)
                              }
                            />
                          </div>
                        )}
                        {app.id === "challenge_prompt" && (
                          <div className="grid gap-2">
                            <Label>Description</Label>
                            <Textarea
                              value={app.description || ""}
                              onChange={(e) =>
                                updateAppConfig(index, "description", e.target.value)
                              }
                            />
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </form>
  );
} 