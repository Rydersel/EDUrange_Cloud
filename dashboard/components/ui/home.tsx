'use client'

import React, { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog"
import { Clock, Award, Shield, Bug, Cpu, X, Check, Zap, Lock, Globe, Terminal, Search, Radio } from 'lucide-react';

const challengeCategories: Record<string, { name: string; points: number }[]> = {
  'Web Exploitation': [
    { name: 'SQL Injection', points: 100 },
    { name: 'XSS Attack', points: 150 },
    { name: 'CSRF Vulnerability', points: 200 },
    { name: 'File Inclusion', points: 250 },
    { name: 'Command Injection', points: 300 },
  ],
  'Cryptography': [
    { name: 'Caesar Cipher', points: 50 },
    { name: 'RSA Challenge', points: 200 },
    { name: 'AES Decryption', points: 250 },
    { name: 'Hash Cracking', points: 150 },
    { name: 'Vigenère Cipher', points: 100 },
  ],
  'Forensics': [
    { name: 'Disk Image Analysis', points: 200 },
    { name: 'Network Packet Inspection', points: 150 },
    { name: 'Steganography', points: 100 },
    { name: 'Memory Dump Analysis', points: 250 },
    { name: 'Log File Investigation', points: 175 },
  ],
  'Reverse Engineering': [
    { name: 'Binary Analysis', points: 300 },
    { name: 'Malware Reverse Engineering', points: 350 },
    { name: 'Mobile App Reversing', points: 250 },
    { name: 'Firmware Analysis', points: 400 },
    { name: 'Obfuscated Code', points: 200 },
  ],
  'Network Security': [
    { name: 'Wireshark Challenge', points: 150 },
    { name: 'Firewall Configuration', points: 200 },
    { name: 'IDS/IPS Evasion', points: 250 },
    { name: 'VPN Exploitation', points: 300 },
    { name: 'DNS Spoofing', points: 225 },
  ],
  'Binary Exploitation': [
    { name: 'Buffer Overflow', points: 250 },
    { name: 'Return-Oriented Programming', points: 350 },
    { name: 'Format String Vulnerability', points: 300 },
    { name: 'Heap Exploitation', points: 400 },
    { name: 'Shellcoding', points: 275 },
  ],
  'OSINT': [
    { name: 'Social Media Investigation', points: 100 },
    { name: 'Geolocation Challenge', points: 150 },
    { name: 'Image Metadata Analysis', points: 125 },
    { name: 'Domain Recon', points: 175 },
    { name: 'Email Tracking', points: 200 },
  ],
  'IoT Security': [
    { name: 'Smart Device Hacking', points: 250 },
    { name: 'Bluetooth LE Exploitation', points: 300 },
    { name: 'MQTT Protocol Analysis', points: 225 },
    { name: 'Firmware Extraction', points: 275 },
    { name: 'ZigBee Security', points: 350 },
  ],
};

const challengePacks = [
  {
    title: "Web Exploitation",
    description: "Explore web vulnerabilities and exploitation techniques",
    difficulty: "Medium",
    category: "Web Exploitation",
    icon: <Globe className="w-6 h-6" style={{ color: '#39FF14' }} />,
  },
  {
    title: "Cryptography",
    description: "Crack codes and decipher encrypted messages",
    difficulty: "Hard",
    category: "Cryptography",
    icon: <Lock className="w-6 h-6" style={{ color: '#39FF14' }} />,
  },
  {
    title: "Forensics",
    description: "Investigate digital evidence and recover hidden data",
    difficulty: "Medium",
    category: "Forensics",
    icon: <Search className="w-6 h-6" style={{ color: '#39FF14' }} />,
  },
  {
    title: "Reverse Engineering",
    description: "Analyze and understand compiled programs",
    difficulty: "Hard",
    category: "Reverse Engineering",
    icon: <Cpu className="w-6 h-6" style={{ color: '#39FF14' }} />,
  },
  {
    title: "Network Security",
    description: "Explore network protocols and security",
    difficulty: "Medium",
    category: "Network Security",
    icon: <Zap className="w-6 h-6" style={{ color: '#39FF14' }} />,
  },
  {
    title: "Binary Exploitation",
    description: "Exploit binary vulnerabilities and gain control",
    difficulty: "Very Hard",
    category: "Binary Exploitation",
    icon: <Terminal className="w-6 h-6" style={{ color: '#39FF14' }} />,
  },
  {
    title: "OSINT",
    description: "Gather intelligence from open sources",
    difficulty: "Easy",
    category: "OSINT",
    icon: <Globe className="w-6 h-6" style={{ color: '#39FF14' }} />,
  },
  {
    title: "IoT Security",
    description: "Secure and exploit Internet of Things devices",
    difficulty: "Hard",
    category: "IoT Security",
    icon: <Radio className="w-6 h-6" style={{ color: '#39FF14' }} />,
  },
];

const difficultyColors: Record<string, { bg: string; text: string }> = {
  "Very Easy": { bg: '#1a472a', text: '#ffffff' },
  "Easy": { bg: '#2a623d', text: '#ffffff' },
  "Medium": { bg: '#397d49', text: '#ffffff' },
  "Hard": { bg: '#4a9358', text: '#ffffff' },
  "Very Hard": { bg: '#5aab66', text: '#ffffff' },
};


const ScoreBreakdownCard = ({ scores }: { scores: Record<string, number> }) => {
  const totalPoints = Object.values(scores).reduce((sum, points) => sum + points, 0);

  return (
      <Card style={{backgroundColor: '#0f2818', borderColor: '#2a623d'}}>
        <CardHeader>
          <CardTitle style={{color: '#39FF14'}}>Score Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{color: '#ffffff', fontSize: '24px', marginBottom: '16px'}}>
            Total Points: <span style={{color: '#39FF14'}}>{totalPoints}</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={{color: '#39FF14'}}>Category</TableHead>
                <TableHead style={{color: '#39FF14'}}>Points</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(scores).map(([category, points]) => (
                  <TableRow key={category}>
                    <TableCell style={{color: '#ffffff'}}>{category}</TableCell>
                    <TableCell style={{color: '#ffffff'}}>{points}</TableCell>
                  </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
  );
}
const ChallengePopup = ({ challenge, isOpen, onClose, onStart, onStop, isActive }: {
  challenge: { name: string; points: number } | null;
  isOpen: boolean;
  onClose: () => void;
  onStart: (challenge: { name: string; points: number }) => void;
  onStop: (challenge: { name: string; points: number }) => void;
  isActive: boolean;
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent style={{ backgroundColor: '#0f2818', borderColor: '#39FF14' }}>
        <DialogHeader>
          <DialogTitle style={{ color: '#39FF14' }}>{challenge?.name}</DialogTitle>
          <DialogDescription style={{ color: '#ffffff' }}>
            Challenge description for {challenge?.name}. Points: {challenge?.points}
          </DialogDescription>
        </DialogHeader>
        {isActive ? (
          <Button
            onClick={() => challenge && onStop(challenge)}
            style={{ backgroundColor: '#8B0000', color: '#ffffff' }}
          >
            Stop Instance
          </Button>
        ) : (
          <Button
            onClick={() => challenge && onStart(challenge)}
            style={{ backgroundColor: '#2a623d', color: '#ffffff' }}
          >
            Start Challenge
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
};

// Add prop types for CTFHomePageClient
interface CTFHomePageClientProps {
  leaderboardData: { rank: number; username: string; points: number; }[];
  pointsBreakdown: { category: string; points: number; }[];
  totalPoints: number;
}

export function CTFHomePageClient({ leaderboardData, pointsBreakdown, totalPoints }: CTFHomePageClientProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedChallenge, setSelectedChallenge] = useState<{ name: string; points: number } | null>(null);
  const [activeChallenge, setActiveChallenge] = useState<{ name: string; points: number } | null>(null);
  const [progress, setProgress] = useState<Record<string, string[]>>(
    Object.fromEntries(Object.keys(challengeCategories).map(category => [category, []]))
  );
  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries(Object.keys(challengeCategories).map(category => [category, 0]))
  );

  const handleCategoryClick = (category: string) => {
    setSelectedCategory(category === selectedCategory ? null : category);
    setSelectedChallenge(null);
  };

  const handleChallengeClick = (challenge: { name: string; points: number }) => {
    setSelectedChallenge(challenge);
  };

  const handleStartChallenge = (challenge: { name: string; points: number }) => {
    console.log(`Starting challenge: ${challenge.name}`);
    setActiveChallenge(challenge);
    setSelectedChallenge(null);
  };

  const handleStopChallenge = (challenge: { name: string; points: number }) => {
    console.log(`Stopping challenge: ${challenge.name}`);
    setActiveChallenge(null);
    if (selectedCategory && !progress[selectedCategory].includes(challenge.name)) {
      setProgress(prev => ({
        ...prev,
        [selectedCategory]: [...prev[selectedCategory], challenge.name]
      }));
      setScores(prev => ({
        ...prev,
        [selectedCategory]: prev[selectedCategory] + challenge.points
      }));
    }
  };

  return (
    <ScrollArea className="h-full" style={{ color: '#ffffff', fontFamily: 'monospace' }}>
      <div className="flex-1 space-y-8 p-8 max-w-7xl mx-auto">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight" style={{ color: '#39FF14' }}>
            CTF Challenges
          </h1>
          <p style={{ color: '#ffffff', maxWidth: '32rem' }}>
            Navigate through our curated list of challenges and compete for a top spot on the leaderboard
          </p>
        </div>

        <ScoreBreakdownCard scores={scores} />

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {challengePacks.map((pack, index) => (
            <Card
              key={index}
              style={{
                backgroundColor: '#0f2818',
                borderColor: selectedCategory === pack.category ? '#39FF14' : '#2a623d',
                cursor: 'pointer',
              }}
              onClick={() => handleCategoryClick(pack.category)}
            >
              <CardHeader>
                <div className="flex justify-between items-start">
                  {pack.icon}
                  <Badge style={{ backgroundColor: difficultyColors[pack.difficulty].bg, color: difficultyColors[pack.difficulty].text }}>
                    {pack.difficulty}
                  </Badge>
                </div>
                <CardTitle className="mt-4" style={{ color: '#39FF14' }}>{pack.title}</CardTitle>
                <CardDescription style={{ color: '#ffffff' }}>
                  {pack.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-4 text-sm mt-4" style={{ color: '#ffffff' }}>
                  <div className="flex items-center">
                    <Clock className="w-4 h-4 mr-1" style={{ color: '#39FF14' }} />
                    {challengeCategories[pack.category].length} challenges
                  </div>
                  <div className="flex items-center">
                    <Check className="w-4 h-4 mr-1" style={{ color: '#39FF14' }} />
                    {progress[pack.category].length} completed
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {selectedCategory && (
          <Card style={{ backgroundColor: '#0f2818', borderColor: '#2a623d', marginTop: '2rem' }}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle style={{ color: '#39FF14' }}>{selectedCategory} Challenges</CardTitle>
              <Button variant="ghost" onClick={() => setSelectedCategory(null)} style={{ color: '#39FF14' }}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead style={{ color: '#39FF14' }}>Challenge</TableHead>
                    <TableHead style={{ color: '#39FF14' }}>Points</TableHead>
                    <TableHead style={{ color: '#39FF14' }}>Status</TableHead>
                    <TableHead style={{ color: '#39FF14' }}>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {challengeCategories[selectedCategory].map((challenge) => (
                    <TableRow key={challenge.name}>
                      <TableCell style={{ color: '#ffffff' }}>{challenge.name}</TableCell>
                      <TableCell style={{ color: '#39FF14' }}>{challenge.points}</TableCell>
                      <TableCell>
                        {progress[selectedCategory].includes(challenge.name) ? (
                          <Badge style={{ backgroundColor: '#2a623d', color: '#ffffff' }}>Completed</Badge>
                        ) : activeChallenge && activeChallenge.name === challenge.name ? (
                          <Badge style={{ backgroundColor: '#8B0000', color: '#ffffff' }}>Active</Badge>
                        ) : (
                          <Badge style={{ backgroundColor: '#4a9358', color: '#ffffff' }}>Not Started</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          onClick={() => handleChallengeClick(challenge)}
                          style={{
                            backgroundColor: '#2a623d',
                            color: '#ffffff',
                          }}
                        >
                          {progress[selectedCategory].includes(challenge.name) ? 'Review' :
                           activeChallenge && activeChallenge.name === challenge.name ? 'View' : 'Start'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <ChallengePopup
          challenge={selectedChallenge}
          isOpen={!!selectedChallenge}
          onClose={() => setSelectedChallenge(null)}
          onStart={handleStartChallenge}
          onStop={handleStopChallenge}
          isActive={Boolean(activeChallenge && activeChallenge.name === selectedChallenge?.name)}
        />
      </div>
    </ScrollArea>
  );
}
